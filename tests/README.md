# Validation

`npm test` builds the package and runs the Node.js helper tests. These tests use fake n8n execution contexts and do not call Speech Expert.

The optional runtime check runs actual n8n workflows in Docker against a loopback HTTP mock. It verifies credentials, declarative routing, multipart audio, operation status handling, binary WAV output, and research requests. It also runs the three bundled examples, including one pending polling response before completion. It requires the already-running Docker Engine and the `n8nio/n8n:2.46.6` image.

After building the package, mount its directory read-only at `/package` and an empty results directory at `/proof`:

```sh
docker run --rm --network none \
  --mount type=bind,source="$(pwd)",target=/package,readonly \
  --mount type=bind,source="$(pwd)/runtime-results",target=/proof \
  --entrypoint node n8nio/n8n:2.46.6 /package/tests/docker-runtime.cjs
```

Create `runtime-results` before running the command. The container copies the compiled package to a temporary directory and changes only the API origin in that copy to its loopback mock. For the bundled examples it binds test credentials, uses the custom-node type prefix, and replaces form triggers with manual fixture input. Their downstream logic is unchanged. The installed source and compiled distribution are not changed. External networking is disabled; the key used by the mock is a test fixture. No paid processing occurs.

To run selected scenarios, pass a comma-separated `CASE_FILTER` environment variable to Docker, for example `-e CASE_FILTER=nativeTranscription` or `-e CASE_FILTER=exampleTranscription,exampleSynthesis,exampleResearch`.

Results and execution evidence are written to `/proof/runtime-report.json` and adjacent files. A failed check writes `runtime-failure.json`. Delete stale results before comparing different runs.
