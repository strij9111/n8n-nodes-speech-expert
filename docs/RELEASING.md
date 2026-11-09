# Maintaining and releasing Speech Expert for n8n

Package: `n8n-nodes-speech-expert`  
Repository: `https://github.com/strij9111/n8n-nodes-speech-expert`  
Initial version: `0.1.0`

The package is not verified until n8n approves it. Publishing an npm package and submitting it for verification are separate steps.

## Local checks

Use Node.js 24 or newer. In the package directory:

```shell
npm ci --ignore-scripts
npm run lint
npm test
npm run build
npm pack --dry-run
```

Dependency install scripts are unnecessary for this package's build and checks. The publish workflow uses the same install option and explicitly runs validation before publishing with `--ignore-scripts`.

Review the packed file list. It must contain the compiled node, credentials, icons, metadata, license, and documentation needed by users. It must not contain API keys, local account data, private audio, environment files, or development artifacts.

Test the built node in an isolated n8n instance before release. Use `npm run dev` only when permitted to start a development instance. The official node CLI can also connect to an existing development instance using its external-n8n mode. Never restart production services as part of publishing this npm package.

Check successful and invalid credentials, binary uploads, successful and failed async operations, WAV downloads, Preview, the Analyze credit cap and consent checks, and A/B full-duration validation. Use small, non-sensitive fixtures. Record the tested n8n version and results rather than claiming compatibility with untested versions.

## Prepare the public repository

1. Keep `package.json` repository metadata pointed at the repository above. Confirm the npm maintainer identity and repository ownership correspond.
2. Keep the MIT license, English README, examples, and changelog current.
3. Commit the lockfile. The package must have no runtime dependencies beyond n8n's supplied peer interface, and node runtime code must not access local files or environment variables.
4. Keep `.github/workflows/publish.yml` enabled on GitHub-hosted runners. It runs checks and publishes with `--provenance --access public` using `id-token: write`.

Since May 1, 2026, n8n requires verification submissions to be published from GitHub Actions with provenance. Do not use a local `npm publish` for the release submitted to n8n. [n8n publication requirements](https://docs.n8n.io/integrations/community-nodes/building-community-nodes.md)

## First npm publication

If the package does not exist yet, reserve it through npm staging, then publish the real release from GitHub Actions. Use npm 11.15.0 or newer.

1. Sign in with `npm login` using the intended maintainer account and complete its 2FA setup.
2. In a separate temporary directory, create this minimal bootstrap `package.json`. Do not change the real project's version:

```json
{
  "name": "n8n-nodes-speech-expert",
  "version": "0.0.0-bootstrap.0",
  "description": "Unapproved name reservation for the Speech Expert n8n node",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/strij9111/n8n-nodes-speech-expert.git"
  }
}
```

3. From that temporary directory, run `npm stage publish --tag bootstrap --access public`. This creates a public `0.0.0-stage` placeholder and a private staged bootstrap version. **Do not approve the bootstrap package.**
4. Configure the package's trusted publisher as below.
5. Run Publish against the reviewed real repository commit using its `v0.1.0` tag or manual workflow action. GitHub Actions publishes the actual `0.1.0` node with provenance.
6. After verifying the real release, reject the unused bootstrap stage with `npm stage reject <stage-id>`; npm requests user 2FA.

Use a distinct bootstrap version: a staged version blocks publication of that same version. Never stage the intended `0.1.0` locally and then try to publish `0.1.0` from CI. The placeholder is not the usable node or a verification submission. [Staging behavior](https://docs.npmjs.com/staged-publishing/), [version uniqueness and rejection](https://docs.npmjs.com/cli/v11/commands/npm-stage/)

## Configure trusted publishing

In the npm package settings, add a GitHub Actions trusted publisher:

| Field | Value |
| --- | --- |
| Repository owner | `strij9111` |
| Repository | `n8n-nodes-speech-expert` |
| Workflow filename | `publish.yml` |
| Environment | Empty, unless the workflow explicitly uses a GitHub environment |
| Allowed action | Direct `npm publish` for this workflow |

Use an npm version that supports OIDC (at least 11.5.1); the publish runner must have Node.js 22.14 or newer. This project uses Node.js 24 or newer. A new trusted-publisher configuration must complete its first successful publication within two days, so configure it when the release is ready. Leave `NPM_TOKEN` unset; OIDC handles authentication without a stored publishing token. [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)

## Publish a subsequent version

1. Update the package version, lockfile, and changelog together.
2. Run local checks and review the diff and packed contents.
3. Push the reviewed commit and matching `v<version>` tag; for example, `v0.1.1`. The workflow also supports manual dispatch for a reviewed commit.
4. Check that the GitHub Actions run succeeds and the npm version has provenance pointing to the correct public repository and commit.
5. Import the examples in a clean test instance with that published package, then repeat a small smoke test.

Each published npm version is immutable. If a publication succeeded, change the version before publishing different contents. If only the workflow failed, inspect its logs and npm state before rerunning.

## Submit to n8n

After successful npm publication, sign in to the [n8n Creator Portal](https://creators.n8n.io/nodes) and submit the package. Supply the public source repository, npm package, setup instructions, and any requested review details. Keep credentials out of public form fields and attachments.

Run the official community-package scan against the published version as part of the submission checks:

```shell
npx @n8n/scan-community-package n8n-nodes-speech-expert
```

Address review feedback and submit a new package version when code changes are needed. n8n's documentation allows up to four weeks for review; this is not a publication guarantee. Only after approval should the README and release notes describe the node as verified. [Verification guidelines](https://github.com/n8n-io/n8n-docs/blob/main/docs/connect/create-nodes/build-your-node/reference/verification-guidelines.md), [submission process](https://docs.n8n.io/integrations/community-nodes/building-community-nodes.md)
