from __future__ import annotations

import json
import sys
import types
from pathlib import Path

import numpy as np

def _install_osgeo_stub() -> None:
    if "osgeo" in sys.modules:
        return

    osgeo = types.ModuleType("osgeo")

    def _noop(*args, **kwargs):
        return None

    class _SpatialReference:
        def __getattr__(self, _name):
            return _noop

    gdal = types.ModuleType("gdal")
    gdal.UseExceptions = _noop
    gdal.PushErrorHandler = _noop
    gdal.PopErrorHandler = _noop
    gdal.SetConfigOption = _noop
    gdal.Open = _noop
    gdal.Translate = _noop
    gdal.Warp = _noop
    gdal.VectorTranslate = _noop
    gdal.GDT_Float32 = 6
    gdal.GDT_Int16 = 3
    gdal.GDT_Int32 = 5
    gdal.GA_ReadOnly = 0
    gdal.GA_Update = 1

    osr = types.ModuleType("osr")
    osr.SpatialReference = _SpatialReference
    osr.OAMS_TRADITIONAL_GIS_ORDER = 0
    osr.UseExceptions = _noop

    osgeo.gdal = gdal
    osgeo.osr = osr
    sys.modules["osgeo"] = osgeo
    sys.modules["osgeo.gdal"] = gdal
    sys.modules["osgeo.osr"] = osr


try:
    from voxcity.generator import get_voxcity
except ModuleNotFoundError as exc:
    if exc.name == "osgeo":
        _install_osgeo_stub()
        from voxcity.generator import get_voxcity
    else:
        raise


OUTPUT_PATH = Path(__file__).resolve().parent / "data" / "manhattan.json"
RECTANGLE_VERTICES = [
    (-74.0210, 40.7040),
    (-74.0040, 40.7040),
    (-74.0040, 40.7140),
    (-74.0210, 40.7140),
]
MESHSIZE = 5


def _to_builtin(value):
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.generic):
        return value.item()
    return value


def _serialize_building_gdf(building_gdf):
    if building_gdf is None:
        return None
    if hasattr(building_gdf, "to_json"):
        try:
            return json.loads(building_gdf.to_json())
        except Exception:
            pass
    if hasattr(building_gdf, "to_dict"):
        try:
            return building_gdf.to_dict(orient="records")
        except Exception:
            try:
                return building_gdf.to_dict()
            except Exception:
                pass
    return str(building_gdf)


def generate_city():
    result = get_voxcity(
        RECTANGLE_VERTICES,
        meshsize=MESHSIZE,
        building_source="OpenStreetMap",
        land_cover_source="OpenStreetMap",
    )

    building_gdf = None
    try:
        (
            voxcity_grid,
            building_height_grid,
            building_min_height_grid,
            building_id_grid,
            canopy_height_grid,
            canopy_bottom_height_grid,
            land_cover_grid,
            dem_grid,
        ) = result
    except (TypeError, ValueError):
        city = result
        voxcity_grid = city.voxels.classes
        building_height_grid = city.buildings.heights
        building_min_height_grid = city.buildings.min_heights
        building_id_grid = city.buildings.ids
        canopy_height_grid = city.tree_canopy.top
        canopy_bottom_height_grid = city.tree_canopy.bottom
        land_cover_grid = city.land_cover.classes
        dem_grid = city.dem.elevation
        building_gdf = city.extras.get("building_gdf", None)

    payload = {
        "shape": list(voxcity_grid.shape),
        "voxcity_grid": _to_builtin(voxcity_grid),
        "building_height_grid": _to_builtin(building_height_grid),
        "building_min_height_grid": _to_builtin(building_min_height_grid),
        "building_id_grid": _to_builtin(building_id_grid),
        "canopy_height_grid": _to_builtin(canopy_height_grid),
        "canopy_bottom_height_grid": _to_builtin(canopy_bottom_height_grid),
        "land_cover_grid": _to_builtin(land_cover_grid),
        "dem_grid": _to_builtin(dem_grid),
        "building_gdf": _serialize_building_gdf(building_gdf),
        "rectangle_vertices": RECTANGLE_VERTICES,
        "meshsize": MESHSIZE,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=True), encoding="utf-8")

    print(f"grid shape: {tuple(payload['shape'])}")
    print(f"saved: {OUTPUT_PATH}")


if __name__ == "__main__":
    generate_city()
