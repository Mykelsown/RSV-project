package simulation

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"rsv-server/engine"
	"rsv-server/models"
	"rsv-server/repo"

	"github.com/google/uuid"
)

const (
	litresPerBarrel = 158.987

	daySeconds            = 24 * time.Hour
	crudeTickProd         = 4 * time.Hour
	crudeTickDev          = 40 * time.Second
	prodTickProd          = 30 * time.Minute
	prodTickDev           = 30 * time.Second
	crudeBudgetMin        = 300000.0
	crudeBudgetMax        = 450000.0
	truckBudgetMin        = 500
	truckBudgetMax        = 900
	truckLitresMin        = 30000.0
	truckLitresMax        = 45000.0
	jitterRange           = 0.30 // +/-30 percent around the tick share
	cumulativeCapPct      = 1.05 // cumulative totals cap at 105 percent of budget
	maintenanceChance     = 0.10 // per unit per day, sampled at day start
	// performance factor sampling: roughly one day in four below 0.75
	factorLowChance   = 0.25
	factorLowMin      = 0.55
	factorLowMax      = 0.75
	factorHighMin     = 0.75
	factorHighMax     = 1.05
)

var (
	instance *Engine
	mu       sync.Mutex
)

// OnEvent is called with an SSE event name ("sim_event" or "sim_state") and the payload.
var broadcastEvent func(event string, payload map[string]any)

func SetBroadcaster(fn func(event string, payload map[string]any)) {
	broadcastEvent = fn
}

// Broadcast sends a "sim_event" style operational payload.
func Broadcast(evt map[string]any) {
	if broadcastEvent != nil {
		broadcastEvent("sim_event", evt)
	}
}

func broadcastState(evt map[string]any) {
	if broadcastEvent != nil {
		broadcastEvent("sim_state", evt)
	}
}

type Stats struct {
	EventsTotal            int `json:"events_total"`
	CrudeIntakeToday       int `json:"crude_intake_today"`
	ProductionUpdatesToday int `json:"production_updates_today"`
	GantryLoadsToday       int `json:"gantry_loads_today"`
}

// dayBudgets holds the plan for one simulated day. Ticks consume shares of
// these budgets so dev mode (fast ticks) and production mode (slow ticks)
// land on the same daily totals.
type dayBudgets struct {
	day          string  // YYYY-MM-DD
	crudeBudget  float64 // barrels
	outputBudget float64 // litres
	truckBudget  int
	unitsPaused  map[string]bool // units in maintenance today
	crudeDone    float64
	outputDone   float64
	trucksDone   int
}

type Engine struct {
	ctx        context.Context
	cancel     context.CancelFunc
	mode       string
	devMode    bool
	running    bool
	paused     bool
	pausedAt   *time.Time
	lastReset  time.Time
	latestDate time.Time
	stats      Stats
	mu         sync.Mutex
	day        dayBudgets
	unitStatus map[string]string
	crudeTicker     *time.Ticker
	productionTicker *time.Ticker
}

func Get() *Engine {
	mu.Lock()
	defer mu.Unlock()
	return instance
}

func ticksPerDay(every time.Duration) int {
	if every <= 0 {
		return 1
	}
	n := int(daySeconds / every)
	if n < 1 {
		n = 1
	}
	return n
}

func randomFloat(min, max float64) float64 {
	return min + rand.Float64()*(max-min)
}

// samplePerformanceFactor picks the day's output factor. About one day in
// four falls between 0.55 and 0.75 so shortfall days appear in the history.
func samplePerformanceFactor() float64 {
	if rand.Float64() < factorLowChance {
		return randomFloat(factorLowMin, factorLowMax)
	}
	return randomFloat(factorHighMin, factorHighMax)
}

// newDayBudgets plans a fresh simulated day.
func newDayBudgets(now time.Time) dayBudgets {
	units := []string{"CDU-1", "CDU-2", "CDU-3"}
	paused := make(map[string]bool)
	status := make(map[string]string)
	for _, unit := range units {
		inMaintenance := rand.Float64() < maintenanceChance
		paused[unit] = inMaintenance
		if inMaintenance {
			status[unit] = "MAINTENANCE"
		} else {
			status[unit] = "RUNNING"
		}
	}
	return dayBudgets{
		day:          now.Format("2006-01-02"),
		crudeBudget:  randomFloat(crudeBudgetMin, crudeBudgetMax),
		outputBudget: samplePerformanceFactor() * 35000000.0,
		truckBudget:  rand.Intn(truckBudgetMax-truckBudgetMin+1) + truckBudgetMin,
		unitsPaused:  paused,
	}
}

// tickShare returns the share of budget owed to this tick, with 30 percent
// jitter, limited so cumulative totals never exceed 105 percent of budget.
func tickShare(budget float64, done float64, ticks int) float64 {
	share := budget / float64(ticks)
	share *= 1.0 + randomFloat(-jitterRange, jitterRange)
	remaining := cumulativeCapPct*budget - done
	if share > remaining {
		share = remaining
	}
	if share < 0 {
		share = 0
	}
	return share
}

func Start(ctx context.Context) (*Engine, error) {
	mode := strings.TrimSpace(os.Getenv("SIM_MODE"))
	if mode == "" {
		mode = "live"
	}
	devMode, _ := strconv.ParseBool(os.Getenv("SIM_DEV_MODE"))
	if mode == "off" {
		return &Engine{ctx: ctx, mode: "off", devMode: devMode, running: false}, nil
	}

	mu.Lock()
	if instance != nil {
		mu.Unlock()
		return instance, nil
	}
	simCtx, simCancel := context.WithCancel(ctx)
	instance = &Engine{ctx: simCtx, cancel: simCancel, mode: mode, devMode: devMode, running: true, lastReset: time.Now().UTC()}
	mu.Unlock()

	if recs, err := repo.GetAllReconciliations(ctx, 1); err == nil && len(recs) > 0 {
		instance.latestDate = recs[0].ReconciliationDate.UTC()
	}
	instance.resetDay(time.Now().UTC())
	instance.syncCountersFromDB(ctx)

	instance.start()
	return instance, nil
}

func (e *Engine) start() {
	if e.mode == "off" {
		return
	}
	crudeEvery := crudeTickProd
	prodEvery := prodTickProd
	if e.devMode {
		crudeEvery = crudeTickDev
		prodEvery = prodTickDev
	}
	if e.crudeTicker != nil {
		e.crudeTicker.Stop()
	}
	if e.productionTicker != nil {
		e.productionTicker.Stop()
	}
	e.crudeTicker = time.NewTicker(crudeEvery)
	e.productionTicker = time.NewTicker(prodEvery)
	go e.loop()
	go e.dailyCloseLoop()
	if e.devMode {
		log.Println("[SIM] simulation engine started in dev mode")
	}
}

func (e *Engine) Stop() {
	if e.cancel != nil {
		e.cancel()
	}
	if e.crudeTicker != nil {
		e.crudeTicker.Stop()
	}
	if e.productionTicker != nil {
		e.productionTicker.Stop()
	}
}

func (e *Engine) loop() {
	for {
		select {
		case <-e.ctx.Done():
			return
		case <-e.crudeTicker.C:
			e.tickCrudeIntake()
		case <-e.productionTicker.C:
			e.tickProductionAndGantry()
		}
	}
}

func (e *Engine) dailyCloseLoop() {
	for {
		select {
		case <-e.ctx.Done():
			return
		default:
			if e.mode == "off" {
				return
			}
			now := time.Now().UTC()
			target := time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 0, 0, time.UTC)
			if now.After(target) {
				target = target.Add(24 * time.Hour)
			}
			wait := time.Until(target)
			if wait <= 0 {
				wait = time.Second
			}
			timer := time.NewTimer(wait)
			select {
			case <-e.ctx.Done():
				if !timer.Stop() {
					<-timer.C
				}
				return
			case <-timer.C:
				// The daily close runs even while the simulation is paused.
				if _, err := e.forceDailyClose(e.ctx); err != nil {
					log.Printf("[SIM] daily close failed: %v", err)
				}
			}
		}
	}
}

// resetDay plans a new day and zeroes the daily counters. It runs at the day
// boundary even when the reconciliation insert fails later, so the simulation
// never carries yesterday's totals into today.
func (e *Engine) resetDay(now time.Time) {
	e.mu.Lock()
	e.day = newDayBudgets(now)
	e.unitStatus = make(map[string]string)
	for unit, paused := range e.day.unitsPaused {
		if paused {
			e.unitStatus[unit] = "MAINTENANCE"
		} else {
			e.unitStatus[unit] = "RUNNING"
		}
	}
	e.stats = Stats{}
	e.lastReset = now
	e.mu.Unlock()
	if e.devMode {
		log.Printf("[SIM] day %s planned: crude %.0f bbl, output %.0f L (%.0f%% of target), %d trucks",
			e.day.day, e.day.crudeBudget, e.day.outputBudget, (e.day.outputBudget/35000000.0)*100, e.day.truckBudget)
	}
}

// rollDayIfBoundary swaps in a fresh day plan whenever the UTC date changed.
func (e *Engine) rollDayIfBoundary(now time.Time) {
	e.mu.Lock()
	today := now.Format("2006-01-02")
	if e.day.day == today {
		e.mu.Unlock()
		return
	}
	e.mu.Unlock()
	e.resetDay(now)
}

func (e *Engine) tickCrudeIntake() {
	if e.mode == "off" {
		return
	}
	if e.IsPaused() {
		if e.devMode {
			log.Println("[SIM] crude intake tick skipped because simulation is paused")
		}
		return
	}

	now := time.Now().UTC()
	e.rollDayIfBoundary(now)

	e.mu.Lock()
	crudeBudget := e.day.crudeBudget
	crudeDone := e.day.crudeDone
	e.mu.Unlock()
	ticks := ticksPerDay(crudeTickProd)
	if e.devMode {
		ticks = ticksPerDay(crudeTickDev)
	}
	share := tickShare(crudeBudget, crudeDone, ticks)
	// Rounding to whole barrels keeps meter readings tidy in dev mode.
	share = float64(int(share))
	if share <= 0 {
		return
	}

	e.mu.Lock()
	e.day.crudeDone += share
	e.mu.Unlock()

	recordedAt := now
	isDevMeterReading := e.devMode

	if isDevMeterReading {
		// Dev mode: small metered terminal readings every tick.
		ci := models.CrudeIntake{
			ID:                  uuid.New(),
			RecordedAt:          recordedAt,
			TankerID:            randomTanker(),
			CrudeType:           randomCrudeType(),
			VolumeBarrels:       share,
			SourceCountry:       randomSourceCountry(),
			AllocationReference: fmt.Sprintf("LIVE-%s-%06d", now.Format("20060102"), e.stats.CrudeIntakeToday+1),
			RecordedBy:          "SIM-TERMINAL-METER-01",
		}
		if err := repo.InsertCrudeIntake(e.ctx, ci); err != nil {
			log.Printf("[SIM] failed to insert crude meter reading: %v", err)
			return
		}
		e.mu.Lock()
		e.stats.EventsTotal++
		e.stats.CrudeIntakeToday++
		e.mu.Unlock()
		if e.devMode {
			log.Printf("[SIM] meter reading inserted: %s %.0f bbl %s", ci.TankerID, ci.VolumeBarrels, ci.CrudeType)
		}
		Broadcast(map[string]any{
			"type":      "crude_intake",
			"kind":      "meter_reading",
			"timestamp": recordedAt.Format(time.RFC3339),
			"data": map[string]any{
				"tanker_id":              ci.TankerID,
				"crude_type":             ci.CrudeType,
				"volume_barrels":         ci.VolumeBarrels,
				"source_country":         ci.SourceCountry,
				"allocation_reference":   ci.AllocationReference,
			},
		})
		return
	}

	// Production mode: full tanker arrivals.
	ci := models.CrudeIntake{
		ID:                  uuid.New(),
		RecordedAt:          recordedAt,
		TankerID:            randomTanker(),
		CrudeType:           randomCrudeType(),
		VolumeBarrels:       share,
		SourceCountry:       randomSourceCountry(),
		AllocationReference: fmt.Sprintf("LIVE-%s-%04d", now.Format("20060102"), rand.Intn(9000)+1000),
		RecordedBy:          "SIM-SENSOR-TERMINAL-01",
	}
	if err := repo.InsertCrudeIntake(e.ctx, ci); err != nil {
		log.Printf("[SIM] failed to insert crude intake: %v", err)
		return
	}
	e.mu.Lock()
	e.stats.EventsTotal++
	e.stats.CrudeIntakeToday++
	e.mu.Unlock()
	if e.devMode {
		log.Printf("[SIM] crude intake inserted: %s %s %.0f bbl", ci.TankerID, ci.CrudeType, ci.VolumeBarrels)
	}
	Broadcast(map[string]any{
		"type":      "crude_intake",
		"kind":      "tanker_arrival",
		"timestamp": recordedAt.Format(time.RFC3339),
		"data": map[string]any{
			"tanker_id":            ci.TankerID,
			"crude_type":           ci.CrudeType,
			"volume_barrels":       ci.VolumeBarrels,
			"source_country":       ci.SourceCountry,
			"allocation_reference": ci.AllocationReference,
		},
	})
}

func (e *Engine) tickProductionAndGantry() {
	if e.mode == "off" {
		return
	}
	if e.IsPaused() {
		if e.devMode {
			log.Println("[SIM] production tick skipped because simulation is paused")
		}
		return
	}

	now := time.Now().UTC()
	e.rollDayIfBoundary(now)

	ticks := ticksPerDay(prodTickProd)
	if e.devMode {
		ticks = ticksPerDay(prodTickDev)
	}

	e.mu.Lock()
	outputBudget := e.day.outputBudget
	outputDone := e.day.outputDone
	e.mu.Unlock()
	combinedShare := tickShare(outputBudget, outputDone, ticks)

	// Split the tick's output share across units. A unit in MAINTENANCE
	// produces zero and its share flows to the units that are running.
	units := []string{"CDU-1", "CDU-2", "CDU-3"}
	var running []string
	e.mu.Lock()
	statusMap := make(map[string]string, len(e.unitStatus))
	for unit, value := range e.unitStatus {
		statusMap[unit] = value
	}
	for _, unit := range units {
		if e.day.unitsPaused[unit] {
			continue
		}
		running = append(running, unit)
	}
	e.mu.Unlock()
	if len(statusMap) == 0 {
		statusMap = make(map[string]string, len(e.day.unitsPaused))
		for unit, paused := range e.day.unitsPaused {
			if paused {
				statusMap[unit] = "MAINTENANCE"
			} else {
				statusMap[unit] = "RUNNING"
			}
		}
	}
	if len(running) == 0 {
		running = units // safety net: treat all as running if sampling failed
	}
	unitShares := make(map[string]float64, len(units))
	base := combinedShare / float64(len(running))
	for _, unit := range running {
		unitShares[unit] = base * (1.0 + randomFloat(-jitterRange, jitterRange))
	}

	combinedOutput := 0.0
	unitPayload := make([]map[string]any, 0, len(units))
	inserted := false
	for _, unit := range units {
		status := "MAINTENANCE"
		output := 0.0
		yieldPct := 0.0
		crudeProcessed := 0.0
		if share, ok := unitShares[unit]; ok && statusMap[unit] != "MAINTENANCE" {
			status = "RUNNING"
			yieldPct = 68.0 + rand.Float64()*8.0
			output = share
			// Back out the barrels this unit consumed to produce the output.
			if yieldPct > 0 {
				crudeProcessed = (share / litresPerBarrel) / (yieldPct / 100.0)
			}
			combinedOutput += output
		}
		pur := models.ProductionUnitReading{
			ID:                    uuid.New(),
			RecordedAt:            now,
			UnitName:              unit,
			CrudeProcessedBarrels: float64(int(crudeProcessed)),
			ProductOutputLitres:   float64(int(output)),
			YieldPercentage:       yieldPct,
			Status:                status,
		}
		if pur.ProductOutputLitres > 0 {
			if err := repo.InsertProductionUnitReading(e.ctx, pur); err != nil {
				log.Printf("[SIM] failed to insert production unit reading for %s: %v", unit, err)
				continue
			}
			inserted = true
		}
		unitPayload = append(unitPayload, map[string]any{
			"unit_name":             unit,
			"status":                status,
			"product_output_litres": pur.ProductOutputLitres,
			"yield_percentage":      yieldPct,
		})
	}
	if inserted {
		e.mu.Lock()
		e.day.outputDone += combinedOutput
		e.stats.EventsTotal++
		e.stats.ProductionUpdatesToday++
		e.mu.Unlock()
	}
	Broadcast(map[string]any{
		"type":      "production_update",
		"timestamp": now.Format(time.RFC3339),
		"data": map[string]any{
			"units":                 unitPayload,
			"combined_output_litres": combinedOutput,
		},
	})
	if e.devMode {
		log.Printf("[SIM] production update: %.0f L this tick across %d units (day total %.0f L)", combinedOutput, len(unitPayload), outputDone+combinedOutput)
	}

	// Gantry loads: discrete trucks. Expected loads per tick is the daily
	// truck budget spread over the day's ticks, so the truck count lands on
	// the budget in both modes. Each truck hauls 30,000 to 45,000 litres.
	e.mu.Lock()
	truckBudget := e.day.truckBudget
	trucksDone := e.day.trucksDone
	e.mu.Unlock()
	expected := float64(truckBudget) / float64(ticks)
	for i := 0; i < poissonLike(expected); i++ {
		if trucksDone >= int(cumulativeCapPct*float64(truckBudget)) {
			break
		}
		product := randomProductType()
		volume := randomFloat(truckLitresMin, truckLitresMax)
		dist := randomDistributor()
		tle := models.TruckLoadingEvent{
			ID:                uuid.New(),
			LoadedAt:          now,
			TruckID:           fmt.Sprintf("SIM-TRK-%d%03d", now.Day(), rand.Intn(900)+100),
			DriverID:          fmt.Sprintf("SIM-DRV-%04d", rand.Intn(10000)),
			DistributorID:     dist.ID,
			DistributorName:   dist.Name,
			ProductType:       product,
			VolumeLitres:      volume,
			DestinationRegion: randomRegion(),
			GantryID:          fmt.Sprintf("GAN-%d", rand.Intn(4)+1),
		}
		if err := repo.InsertTruckLoadingEvent(e.ctx, tle); err != nil {
			log.Printf("[SIM] failed to insert gantry load: %v", err)
			continue
		}
		e.mu.Lock()
		e.day.trucksDone++
		e.stats.EventsTotal++
		e.stats.GantryLoadsToday++
		trucksDone = e.day.trucksDone
		e.mu.Unlock()
		Broadcast(map[string]any{
			"type":      "gantry_load",
			"timestamp": now.Format(time.RFC3339),
			"data": map[string]any{
				"truck_id":           tle.TruckID,
				"distributor_name":   tle.DistributorName,
				"product_type":       tle.ProductType,
				"volume_litres":      tle.VolumeLitres,
				"gantry_id":          tle.GantryID,
				"destination_region": tle.DestinationRegion,
			},
		})
	}
}

// poissonLike draws a small non-negative integer count around the expected
// value, good enough for load arrivals without a full Poisson sampler.
func poissonLike(expected float64) int {
	if expected <= 0 {
		return 0
	}
	intPart := int(expected)
	frac := expected - float64(intPart)
	n := intPart
	if rand.Float64() < frac {
		n++
	}
	// Occasional +/-1 burst keeps arrivals looking irregular.
	if rand.Float64() < 0.15 {
		if rand.Float64() < 0.5 && n > 0 {
			n--
		} else {
			n++
		}
	}
	if n < 0 {
		n = 0
	}
	return n
}

func (e *Engine) ForceClose(ctx context.Context) (*models.DailyReconciliation, error) {
	return e.forceDailyClose(ctx)
}

func (e *Engine) forceDailyClose(ctx context.Context) (*models.DailyReconciliation, error) {
	today := time.Now().UTC()
	dayClose := today.Format("2006-01-02")
	rec, err := e.closeDay(ctx, dayClose)
	// The new day plan and counters always start clean, even if the
	// reconciliation insert failed, so totals never carry over.
	e.resetDay(today)
	return rec, err
}

// closeDay reconciles a specific simulated day and logs the full database
// error when it fails instead of swallowing it.
func (e *Engine) closeDay(ctx context.Context, dayKey string) (*models.DailyReconciliation, error) {
	target, err := time.Parse("2006-01-02", dayKey)
	if err != nil {
		return nil, fmt.Errorf("bad day key %q: %w", dayKey, err)
	}
	if exists, err := repo.ReconciliationExists(ctx, target); err == nil && exists {
		return repo.GetDailyReconciliationByDate(ctx, target)
	}
	rec, err := engine.RunReconciliation(ctx, target)
	if err != nil {
		// Log the full error so database failures (overflow, constraints)
		// are visible in the logs instead of silently missing rows.
		log.Printf("[SIM] daily close for %s failed: %v", dayKey, err)
		return nil, err
	}
	if e.devMode {
		log.Println("[SIM] Daily close complete. New simulation day started.")
	} else {
		log.Println("Daily close complete. New simulation day started.")
	}
	broadcastState(map[string]any{
		"paused":    e.IsPaused(),
		"dayClosed": dayKey,
		"fulfillment_percentage": rec.FulfillmentPercentage,
		"status":    rec.Status,
	})
	return rec, nil
}

// Pause stops data generation. Idempotent: pausing an already-paused
// simulation is a no-op. The daily close still runs while paused.
func (e *Engine) Pause() {
	changed := false
	e.mu.Lock()
	if !e.paused {
		e.paused = true
		now := time.Now().UTC()
		e.pausedAt = &now
		changed = true
	}
	e.mu.Unlock()
	if changed {
		log.Println("[SIM] paused")
		e.broadcastSimState()
	}
}

// Resume restarts data generation on the next tick. Idempotent.
func (e *Engine) Resume() {
	changed := false
	e.mu.Lock()
	if e.paused {
		e.paused = false
		e.pausedAt = nil
		changed = true
	}
	e.mu.Unlock()
	if changed {
		log.Println("[SIM] resumed")
		e.broadcastSimState()
	}
}

func (e *Engine) broadcastSimState() {
	broadcastState(map[string]any{
		"type":   "sim_state",
		"paused": e.IsPaused(),
		"mode":   e.mode,
		"dev_mode": e.devMode,
		"stats":  e.StatsSnapshot(),
	})
}

func (e *Engine) IsPaused() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.paused
}

// IsRunning reports whether the engine is alive and not switched off.
func (e *Engine) IsRunning() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.running && e.mode != "off"
}

// Mode returns the raw SIM_MODE value.
func (e *Engine) Mode() string {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.mode
}

// IsDevMode reports the SIM_DEV_MODE flag.
func (e *Engine) IsDevMode() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.devMode
}

// BroadcastSimState pushes a sim_state event so all connected tabs refresh
// their simulation widgets immediately.
func BroadcastSimState() {
	if sim := Get(); sim != nil {
		sim.broadcastSimState()
	}
}

// StatsSnapshot copies the daily counters under the engine lock.
func (e *Engine) StatsSnapshot() map[string]any {
	e.mu.Lock()
	defer e.mu.Unlock()
	return map[string]any{
		"events_total":             e.stats.EventsTotal,
		"crude_intake_today":       e.stats.CrudeIntakeToday,
		"production_updates_today": e.stats.ProductionUpdatesToday,
		"gantry_loads_today":       e.stats.GantryLoadsToday,
	}
}

func (e *Engine) Status() map[string]any {
	e.mu.Lock()
	defer e.mu.Unlock()
	stats := map[string]any{
		"events_total":             e.stats.EventsTotal,
		"crude_intake_today":       e.stats.CrudeIntakeToday,
		"production_updates_today": e.stats.ProductionUpdatesToday,
		"gantry_loads_today":       e.stats.GantryLoadsToday,
	}
	status := map[string]any{
		"running": e.running && e.mode != "off",
		"paused":  e.paused,
		"mode":    e.mode,
		"dev_mode": e.devMode,
		"stats":   stats,
	}
	if e.pausedAt != nil {
		status["paused_at"] = e.pausedAt.Format(time.RFC3339)
	} else {
		status["paused_at"] = nil
	}
	return status
}

// syncCountersFromDB resets the in-memory daily counters to match the rows
// that survived any startup repair, so the widgetsreflect reality.
func (e *Engine) syncCountersFromDB(ctx context.Context) {
	now := time.Now().UTC()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	crudeRows, err := repo.CountCrudeIntakeForDay(ctx, startOfDay)
	if err != nil {
		log.Printf("[SIM] startup counter sync failed for crude intake: %v", err)
		return
	}
	producedRows, err := repo.CountProductionReadingsForDay(ctx, startOfDay)
	if err != nil {
		log.Printf("[SIM] startup counter sync failed for production readings: %v", err)
		return
	}
	truckRows, err := repo.CountTruckLoadingsForDay(ctx, startOfDay)
	if err != nil {
		log.Printf("[SIM] startup counter sync failed for truck loadings: %v", err)
		return
	}

	events := crudeRows + producedRows + truckRows
	e.mu.Lock()
	e.stats = Stats{
		EventsTotal:            events,
		CrudeIntakeToday:       crudeRows,
		ProductionUpdatesToday: producedRows,
		GantryLoadsToday:       truckRows,
	}
	e.lastReset = now
	e.mu.Unlock()
	if e.devMode {
		log.Printf("[SIM] startup counters synced from database: %d events today", events)
	}
}

func randomTanker() string {
	list := []string{"MT NIGER DELTA", "MT LAGOS STAR", "MT BENIN QUEEN", "MT CALABAR", "MT PORT HARCOURT", "MT WARRI PRINCESS", "MT SAPELE", "MT ENUGU", "MT ONITSHA", "MT ABUJA SPIRIT"}
	return list[rand.Intn(len(list))]
}

func randomCrudeType() string {
	list := []string{"Bonny Light", "Forcados Blend", "Qua Iboe", "Brass River", "Escravos Blend"}
	return list[rand.Intn(len(list))]
}

func randomSourceCountry() string {
	list := []string{"Nigeria", "Angola", "Equatorial Guinea", "Gabon"}
	return list[rand.Intn(len(list))]
}

func randomProductType() string {
	list := []string{"Petrol", "Diesel", "Kerosene"}
	return list[rand.Intn(len(list))]
}

func randomRegion() string {
	list := []string{"Lagos", "Ogun", "Abuja", "Kaduna", "Port Harcourt", "Warri", "Kano"}
	return list[rand.Intn(len(list))]
}

type distributor struct {
	ID   string
	Name string
}

func randomDistributor() distributor {
	list := []distributor{{ID: "DIST001", Name: "MRS Oil Nigeria Plc"}, {ID: "DIST002", Name: "Total Nigeria Plc"}, {ID: "DIST003", Name: "Oando Plc"}, {ID: "DIST004", Name: "NNPC Retail Limited"}, {ID: "DIST005", Name: "Ardova Plc"}, {ID: "DIST006", Name: "HIPOL"}}
	return list[rand.Intn(len(list))]
}
