# DrillSwitch web app

The Next.js app. For setup, architecture and the hackathon tracks, see the [main README](../README.md).

```bash
npm run dev        # http://localhost:3100 (after ../setup.sh)
npm run simulate   # simulated players for the experiment: --players 40 --concurrency 4 --seed 7 [--scenario id]
npm run bootstrap  # re-apply the Flagsmith configuration (needs FLAGSMITH_API_KEY; ../setup.sh does this)
npm run lint
```

Optional keys are documented in [`.env.example`](.env.example).
