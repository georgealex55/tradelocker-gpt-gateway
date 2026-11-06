-- Run ONLY in the dedicated xmi-forex-simulation-staging project / xmi_simulation.
CREATE TABLE IF NOT EXISTS xmi_sim_guard(id integer PRIMARY KEY CHECK(id=1), environment_id text NOT NULL, simulation_only boolean NOT NULL CHECK(simulation_only));
INSERT INTO xmi_sim_guard VALUES(1,'xmi-forex-staging-v3',true) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS xmi_sim_state(environment_id text PRIMARY KEY,revision bigint NOT NULL DEFAULT 0,payload jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO xmi_sim_state(environment_id,payload) VALUES('xmi-forex-staging-v1','{"schema":1,"paused":false,"jobs":[],"runs":[],"holdouts":[],"lifecycle":[],"quota":{"day":"","used":0,"lastByKey":{}},"scheduler":{"installed":false,"enabled":false,"reason":"No unattended preview worker installed. Use Resume next step."}}') ON CONFLICT(environment_id) DO NOTHING;
CREATE TABLE IF NOT EXISTS xmi_sim_datasets(id text PRIMARY KEY,environment_id text NOT NULL REFERENCES xmi_sim_state(environment_id),payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
