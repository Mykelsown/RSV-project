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

var (
	instance *Engine
	mu      sync.Mutex
)

var broadcastFunc func(map[string]any)

func SetBroadcaster(fn func(map[string]any)) {
	broadcastFunc = fn
}

func Broadcast(evt map[string]any) {
	if broadcastFunc != nil {
		broadcastFunc(evt)
	}
}

type Stats struct {
	EventsTotal                 int `json:"events_total"`
	CrudeIntakeToday            int `json:"crude_intake_today"`
	ProductionUpdatesToday      int `json:"production_updates_today"`
	GantryLoadsToday            int `json:"gantry_loads_today"`
}

type Engine struct {
	ctx          context.Context
	cancel       context.CancelFunc
	mode         string
	devMode      bool
	running      bool
	paused       bool
	lastReset    time.Time
	latestDate   time.Time
	stats        Stats
	mu           sync.Mutex
	crudeTicker  *time.Ticker
	productionTicker *time.Ticker
}

func Get() *Engine {
	mu.Lock()
	defer mu.Unlock()
	return instance
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

	instance.start()
	return instance, nil
}

func (e *Engine) start() {
	if e.mode == "off" {
		return
	}
	crudeEvery := 4 * time.Hour
	prodEvery := 30 * time.Minute
	if e.devMode {
		crudeEvery = 40 * time.Second
		prodEvery = 30 * time.Second
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
				if _, err := e.forceDailyClose(e.ctx); err != nil {
					log.Printf("[SIM] daily close failed: %v", err)
				}
			}
		}
	}
}

func (e *Engine) tickCrudeIntake() {
	if e.mode == "off" {
		return
	}
	e.mu.Lock()
	paused := e.paused
	e.mu.Unlock()
	if paused {
		if e.devMode {
			log.Println("[SIM] crude intake tick skipped because simulation is paused")
		}
		return
	}

	if rand.Float64() > 0.7 {
		if e.devMode {
			log.Println("[SIM] crude intake event skipped by random chance")
		}
		return
	}

	recordedAt := time.Now().UTC()

	ci := models.CrudeIntake{
		ID:                  uuid.New(),
		RecordedAt:          recordedAt,
		TankerID:            randomTanker(),
		CrudeType:           randomCrudeType(),
		VolumeBarrels:       80000 + rand.Float64()*60000,
		SourceCountry:       randomSourceCountry(),
		AllocationReference: fmt.Sprintf("LIVE-%s-%04d", time.Now().UTC().Format("20060102"), rand.Intn(9000)+1000),
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
		"type": "crude_intake",
		"timestamp": recordedAt.Format(time.RFC3339),
		"data": map[string]any{
			"tanker_id": ci.TankerID,
			"crude_type": ci.CrudeType,
			"volume_barrels": ci.VolumeBarrels,
			"source_country": ci.SourceCountry,
			"allocation_reference": ci.AllocationReference,
		},
	})
}

func (e *Engine) tickProductionAndGantry() {
	if e.mode == "off" {
		return
	}
	e.mu.Lock()
	paused := e.paused
	e.mu.Unlock()
	if paused {
		if e.devMode {
			log.Println("[SIM] production tick skipped because simulation is paused")
		}
		return
	}

	now := time.Now().UTC()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	crudeTotal, err := repo.GetTodayCrudeIntakeTotal(e.ctx, startOfDay)
	if err != nil {
		log.Printf("[SIM] failed to fetch crude total: %v", err)
		return
	}

	units := []string{"CDU-1", "CDU-2", "CDU-3"}
	combinedOutput := 0.0
	unitPayload := make([]map[string]any, 0, 3)
	for _, unitName := range units {
		status := "RUNNING"
		output := 0.0
		yieldPct := 0.0
		if rand.Float64() < 0.1 {
			status = "MAINTENANCE"
		} else {
			crudeProcessed := crudeTotal / 3.0
			yieldPct = 68.0 + rand.Float64()*8.0
			output = crudeProcessed * 158.987 * (yieldPct / 100.0)
			combinedOutput += output
		}
		pur := models.ProductionUnitReading{
			ID:                    uuid.New(),
			RecordedAt:            now,
			UnitName:              unitName,
			CrudeProcessedBarrels: crudeTotal / 3.0,
			ProductOutputLitres:   output,
			YieldPercentage:       yieldPct,
			Status:                status,
		}
		if err := repo.InsertProductionUnitReading(e.ctx, pur); err != nil {
			log.Printf("[SIM] failed to insert production unit reading for %s: %v", unitName, err)
			continue
		}
		unitPayload = append(unitPayload, map[string]any{
			"unit_name": unitName,
			"status": status,
			"product_output_litres": output,
			"yield_percentage": yieldPct,
		})
	}

	count := rand.Intn(10) + 3
	for i := 0; i < count; i++ {
		product := randomProductType()
		volume := 20000.0 + rand.Float64()*50000.0
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
		Broadcast(map[string]any{
			"type": "gantry_load",
			"timestamp": now.Format(time.RFC3339),
			"data": map[string]any{
				"truck_id": tle.TruckID,
				"distributor_name": tle.DistributorName,
				"product_type": tle.ProductType,
				"volume_litres": tle.VolumeLitres,
				"gantry_id": tle.GantryID,
				"destination_region": tle.DestinationRegion,
			},
		})
		e.mu.Lock(); e.stats.EventsTotal++; e.stats.GantryLoadsToday++; e.mu.Unlock()
	}

	e.mu.Lock(); e.stats.EventsTotal++; e.stats.ProductionUpdatesToday++; e.mu.Unlock()
	Broadcast(map[string]any{
		"type": "production_update",
		"timestamp": now.Format(time.RFC3339),
		"data": map[string]any{
			"units": unitPayload,
			"combined_output_litres": combinedOutput,
		},
	})
	if e.devMode {
		log.Printf("[SIM] production update generated: %.0f L total output across %d units", combinedOutput, len(unitPayload))
	}
}

func (e *Engine) ForceClose(ctx context.Context) (*models.DailyReconciliation, error) {
	return e.forceDailyClose(ctx)
}

func (e *Engine) forceDailyClose(ctx context.Context) (*models.DailyReconciliation, error) {
	today := time.Now().UTC()
	startOfDay := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC)
	if exists, err := repo.ReconciliationExists(ctx, startOfDay); err == nil && exists {
		return repo.GetDailyReconciliationByDate(ctx, startOfDay)
	}
	rec, err := engine.RunReconciliation(ctx, startOfDay)
	if err != nil {
		return nil, err
	}
	e.resetDailyStats()
	if e.devMode {
		log.Println("[SIM] Daily close complete. New simulation day started.")
	} else {
		log.Println("Daily close complete. New simulation day started.")
	}
	return rec, nil
}

func (e *Engine) Pause() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.paused = true
	if e.devMode {
		log.Println("[SIM] simulation paused")
	}
}

func (e *Engine) Resume() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.paused = false
	if e.devMode {
		log.Println("[SIM] simulation resumed")
	}
}

func (e *Engine) IsPaused() bool {
	e.mu.Lock(); defer e.mu.Unlock(); return e.paused
}

func (e *Engine) Status() map[string]any {
	e.mu.Lock(); defer e.mu.Unlock()
	return map[string]any{
		"running": e.running && e.mode != "off",
		"mode":    e.mode,
		"dev_mode": e.devMode,
		"stats": map[string]any{
			"events_total": e.stats.EventsTotal,
			"crude_intake_today": e.stats.CrudeIntakeToday,
			"production_updates_today": e.stats.ProductionUpdatesToday,
			"gantry_loads_today": e.stats.GantryLoadsToday,
		},
	}
}

func (e *Engine) resetDailyStats() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.stats = Stats{}
	e.lastReset = time.Now().UTC()
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
