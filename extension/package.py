"""Package only the already built, secret-free MV3 files. No dependencies."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent
files = sorted((root / "dist" / "unpacked").glob("*"))
if not files or not any(p.name == "manifest.json" for p in files):
    raise SystemExit("Run node extension/build.mjs first")
target = root / "dist" / "counterpoint-extension.zip"
with ZipFile(target, "w", ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, path.name)
print(target)
