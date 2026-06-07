import json
import subprocess
from pathlib import Path

# Paths
DATA_FILE = Path(__file__).resolve().parent / "data" / "manhattan.json"
SPACETIME_APP_NAME = "urban-whatif"

def main():
    if not DATA_FILE.exists():
        print(f"Error: {DATA_FILE} not found. Run generate_city.py first.")
        return

    print("Loading manhattan.json...")
    with open(DATA_FILE, "r") as f:
        data = json.load(f)

    grid = data["voxcity_grid"]
    shape = data["shape"]
    width = shape[0]
    depth = shape[1]
    
    print(f"Grid dimensions: {width} x {depth}")
    
    # Generate 1D surface string
    # For each x, z find the highest non-zero voxel type
    surface_chars = []
    for row in range(width):
        for col in range(depth):
            column = grid[row][col]
            top_type = 0
            for level in range(len(column) - 1, -1, -1):
                if column[level] != 0:
                    top_type = column[level]
                    break
            # Convert type to char (0-9)
            # 1: Building, 2: Grass, 3: Road, 4: Water, 5: Terrain
            surface_chars.append(str(top_type))
            
    grid_string = "".join(surface_chars)
    print(f"Generated surface string of length {len(grid_string)}")
    
    # Call spacetime CLI
    print("Uploading to SpacetimeDB...")
    args_json = json.dumps({
        "width": width,
        "depth": depth,
        "gridData": grid_string
    })
    
    # Escape for shell
    escaped_json = args_json.replace('"', '\\"')
    
    cmd = f'spacetime call {SPACETIME_APP_NAME} uploadSurfaceGrid "{escaped_json}"'
    
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode == 0:
        print("Upload successful!")
        print(result.stdout)
    else:
        print("Upload failed!")
        print(result.stderr)

if __name__ == "__main__":
    main()
