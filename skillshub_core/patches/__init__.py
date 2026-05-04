# Top-level patches package shim for skillshub_core
# This package proxies to the actual implementation located under
# `skillshub_core/skillshub_core/patches` so that patches referenced
# in `patches.txt` (e.g. skillshub_core.patches.v1_0.migrate_legacy_data)
# can be imported during `bench migrate`.
