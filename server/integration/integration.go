package integration

import (
	"context"
	"fmt"
	"sync"
)

type DataSource interface {
	Name() string
	Description() string
	Kind() string
	Connect() error
	Ingest(ctx context.Context, payload map[string]any) error
	Status() map[string]any
}

type Registry struct {
	mu      sync.RWMutex
	sources map[string]DataSource
}

func NewRegistry() *Registry {
	return &Registry{sources: make(map[string]DataSource)}
}

func (r *Registry) Register(source DataSource) {
	if source == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sources[source.Name()] = source
}

func (r *Registry) Get(name string) (DataSource, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	source, ok := r.sources[name]
	return source, ok
}

func (r *Registry) All() []DataSource {
	r.mu.RLock()
	defer r.mu.RUnlock()
	items := make([]DataSource, 0, len(r.sources))
	for _, source := range r.sources {
		items = append(items, source)
	}
	return items
}

func (r *Registry) Ingest(ctx context.Context, name string, payload map[string]any) error {
	source, ok := r.Get(name)
	if !ok {
		return fmt.Errorf("data source %q not found", name)
	}
	return source.Ingest(ctx, payload)
}

type SimulatedSCADADataSource struct{}

func NewSimulatedSCADADataSource() *SimulatedSCADADataSource {
	return &SimulatedSCADADataSource{}
}

func (s *SimulatedSCADADataSource) Name() string { return "simulated-scada" }
func (s *SimulatedSCADADataSource) Description() string { return "Live simulated SCADA and sensor ingestion stream" }
func (s *SimulatedSCADADataSource) Kind() string { return "SCADA" }
func (s *SimulatedSCADADataSource) Connect() error { return nil }
func (s *SimulatedSCADADataSource) Ingest(ctx context.Context, payload map[string]any) error { return nil }
func (s *SimulatedSCADADataSource) Status() map[string]any {
	return map[string]any{
		"name":       "simulated-scada",
		"kind":       "SCADA",
		"status":     "connected",
		"last_seen":  "live",
		"description": "Live data source for refinery sensor simulation",
	}
}

var defaultRegistry = NewRegistry()

func DefaultRegistry() *Registry { return defaultRegistry }

func RegisterDefaultSources() {
	defaultRegistry.Register(NewSimulatedSCADADataSource())
}

func ProcessIngestPayload(ctx context.Context, payload map[string]any) error {
	name, _ := payload["source"].(string)
	if name == "" {
		name = "simulated-scada"
	}
	return defaultRegistry.Ingest(ctx, name, payload)
}
