# 3D Visual Map Generator

A four-layer 3D city visualisation system: procedural Python generator → PostGIS spatial database → Node.js GeoJSON API → Three.js WebGL client.

## Project Structure

```
city3d/
├── generator/          # Layer 1 — Python procedural city generator
│   ├── config.py
│   ├── city_generator.py
│   ├── building_processing.py
│   ├── geometry.py
│   ├── mesh_builder.py
│   ├── streets.py
│   ├── visualization.py
│   ├── db_writer.py        ← NEW: PostGIS insert
│   ├── main.py
│   └── requirements.txt
│
├── database/           # Layer 2 — PostGIS schema & helpers
│   ├── schema.sql          ← CREATE TABLE + indexes
│   └── queries.sql         ← Viewport bbox queries
│
├── api/                # Layer 3 — Node.js Express GeoJSON API
│   ├── src/
│   │   ├── index.js        ← Entry point
│   │   ├── db.js           ← pg connection pool
│   │   ├── routes/
│   │   │   ├── buildings.js
│   │   │   └── streets.js
│   │   └── middleware/
│   │       └── validate.js
│   ├── package.json
│   └── .env.example
│
├── client/             # Layer 4 — Three.js browser client
│   ├── index.html
│   ├── src/
│   │   ├── main.js         ← Entry point
│   │   ├── scene.js        ← Three.js scene setup
│   │   ├── renderer.js     ← Buildings + streets extrusion
│   │   ├── lod.js          ← LOD management
│   │   ├── api.js          ← Fetch from Node API
│   │   └── geo.js          ← Coordinate helpers
│   ├── package.json
│   └── vite.config.js
│
└── docker/             # Docker Compose for full stack
    └── docker-compose.yml
```

## Quick Start

### 1. Start the database
```bash
cd docker
docker-compose up -d postgres
```

### 2. Apply schema
```bash
psql $DATABASE_URL -f database/schema.sql

$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/city3d"
psql $env:DATABASE_URL -f database/schema.sql
```

### 3. Generate a synthetic city
```bash
cd generator
pip install -r requirements.txt
python main.py

python main.py --osm-file ../data/osm/map.osm --no-viewer     for osm
```

### 4. Start the API
```bash
cd api
npm install
cp .env.example .env   # edit DB credentials
npm start
```

### 5. Start the client
```bash
cd client
npm install
npm run dev
```
Then open http://localhost:5173

## LOD Levels

| Level | Description | Features |
|-------|-------------|----------|
| 0 | Minimal | Flat footprints only |
| 1 | Basic | Simple height extrusion |
| 2 | Standard | Building levels |
| 3 | Detailed | Roofs, colours, materials |
| 4 | Maximum | All data + streets |
