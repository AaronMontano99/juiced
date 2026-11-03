-- JUICED · 00_schema.sql
-- Raw layer: the Lahman tables we use, typed explicitly, with keys.
-- Engine: DuckDB (PostgreSQL-flavored SQL). Everything here also runs in the browser via DuckDB-WASM.

CREATE SCHEMA IF NOT EXISTS raw;

CREATE OR REPLACE TABLE raw.people (
    player_id    VARCHAR PRIMARY KEY,
    birth_year   INTEGER,
    birth_month  INTEGER,
    birth_day    INTEGER,
    birth_country VARCHAR,
    name_first   VARCHAR,
    name_last    VARCHAR,
    bats         VARCHAR,
    throws       VARCHAR,
    weight       INTEGER,
    height       INTEGER,
    debut        DATE,
    final_game   DATE,
    bbref_id     VARCHAR
);

CREATE OR REPLACE TABLE raw.batting (
    player_id VARCHAR NOT NULL,
    year_id   INTEGER NOT NULL,
    stint     INTEGER NOT NULL,
    team_id   VARCHAR NOT NULL,
    lg_id     VARCHAR,
    g INTEGER, ab INTEGER, r INTEGER, h INTEGER,
    doubles INTEGER, triples INTEGER, hr INTEGER, rbi INTEGER,
    sb INTEGER, cs INTEGER, bb INTEGER, so INTEGER, ibb INTEGER,
    hbp INTEGER, sh INTEGER, sf INTEGER, gidp INTEGER,
    PRIMARY KEY (player_id, year_id, stint)
);

CREATE OR REPLACE TABLE raw.teams (
    year_id   INTEGER NOT NULL,
    lg_id     VARCHAR,
    team_id   VARCHAR NOT NULL,
    franch_id VARCHAR,
    g INTEGER, w INTEGER, l INTEGER,
    r INTEGER, ab INTEGER, h INTEGER, hr INTEGER, bb INTEGER, so INTEGER,
    hra INTEGER,
    name VARCHAR, park VARCHAR,
    bpf INTEGER, ppf INTEGER,
    PRIMARY KEY (year_id, team_id)
);

-- Hand-curated, sourced table. NOT inferred from stats. See data/seed/README.md.
--   tier = 'confirmed'  official MLB PED suspension, or the player's own public admission
--   tier = 'named'      named in the Mitchell Report / BALCO / reported on the 2003 survey list, without a suspension or admission
--   tier = 'stimulant'  amphetamine/Adderall suspension only (excluded from power analysis)
CREATE OR REPLACE TABLE raw.ped_events (
    player_id  VARCHAR NOT NULL REFERENCES raw.people (player_id),
    name       VARCHAR NOT NULL,
    event_type VARCHAR NOT NULL CHECK (event_type IN ('suspension','admission','mitchell','investigation','reported')),
    event_date DATE    NOT NULL,
    tier       VARCHAR NOT NULL CHECK (tier IN ('confirmed','named','stimulant')),
    substance  VARCHAR,
    detail     VARCHAR,
    source     VARCHAR NOT NULL
);

-- MLB drug-policy milestones. Hand-built; every row carries a verbatim quote and its source page.
CREATE OR REPLACE TABLE raw.policy_events (
    event_date     DATE    NOT NULL,
    date_precision VARCHAR NOT NULL CHECK (date_precision IN ('day','month','season','year')),
    kind           VARCHAR NOT NULL CHECK (kind IN ('policy','testing','penalty','investigation','suspension')),
    event          VARCHAR NOT NULL,
    quote          VARCHAR NOT NULL,
    source         VARCHAR NOT NULL,
    note           VARCHAR
);

-- Food available for consumption per person per year (kg). FAO Food Balances via Our World in Data.
-- See scripts/fetch_food.py. Used only by the bonus case, which is a joke on purpose.
CREATE OR REPLACE TABLE raw.food_supply (
    entity        VARCHAR NOT NULL,
    year          INTEGER NOT NULL,
    food          VARCHAR NOT NULL,
    kg_per_capita DOUBLE  NOT NULL,
    PRIMARY KEY (entity, year, food)
);
