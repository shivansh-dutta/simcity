import * as fs from 'fs';
import * as path from 'path';
import { DbConnection } from './client/src/module_bindings';

const DATA_FILE = path.resolve(process.cwd(), '../backend/data/manhattan.json');
const STDB_HOST = 'wss://maincloud.spacetimedb.com';
const STDB_MODULE = 'urban-whatif';

function main() {
    console.log(`Loading ${DATA_FILE}...`);
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const grid = data.voxcity_grid;
    const width = data.shape[0];
    const depth = data.shape[1];

    console.log(`Grid dimensions: ${width} x ${depth}`);

    function normalizeVoxelCode(value: number): number {
        if (value === 0) return 0;
        if (value === -3 || value === 13) return 1;
        if (value === -2 || value === 2 || value === 5 || value === 8) return 2;
        if (value === 9) return 4;
        if (value === 1 || value === 3 || value === 4 || value === 6 || value === 7) return 5;
        if (value === 11 || value === 12 || value === 14 || value === -1) return 3;
        return value > 0 ? 3 : 0;
    }

    let surface_chars = '';
    for (let row = 0; row < width; row++) {
        for (let col = 0; col < depth; col++) {
            const column = grid[row][col];
            let top_type = 0;
            for (let level = column.length - 1; level >= 0; level--) {
                if (column[level] !== 0) {
                    top_type = normalizeVoxelCode(column[level]);
                    break;
                }
            }
            surface_chars += top_type.toString();
        }
    }

    console.log(`Generated surface string of length ${surface_chars.length}`);

    console.log('Connecting to SpacetimeDB...');
    const conn = DbConnection.builder()
        .withUri(STDB_HOST)
        .withDatabaseName(STDB_MODULE)
        .onConnect((_conn, identity) => {
            console.log('Connected! Identity:', identity.toHexString());
            console.log('Calling uploadSurfaceGrid...');
            conn.reducers.uploadSurfaceGrid({ width, depth, gridData: surface_chars });
            
            setTimeout(() => {
                console.log('Upload initiated. Closing connection.');
                process.exit(0);
            }, 3000); // Wait for the message to send
        })
        .onConnectError((_ctx, err) => {
            console.error('Connection error:', err);
            process.exit(1);
        })
        .build();
}

main();
