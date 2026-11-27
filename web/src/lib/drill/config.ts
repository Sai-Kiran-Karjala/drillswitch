import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Run scripts/bootstrap.mjs to create web/.env.local.`);
  return value;
}

export function getConfig() {
  const url = (process.env.FLAGSMITH_URL ?? "http://localhost:8000").replace(/\/$/, "");
  return {
    url,
    adminKey: required("FLAGSMITH_ADMIN_KEY"),
    projectId: Number(required("FLAGSMITH_PROJECT_ID")),
    organisationId: Number(required("FLAGSMITH_ORGANISATION_ID")),
    env: {
      production: required("FLAGSMITH_ENV_PRODUCTION"),
      staging: required("FLAGSMITH_ENV_STAGING"),
      simulation: required("FLAGSMITH_ENV_SIMULATION"),
    },
    segments: {
      eu_customers: Number(required("FLAGSMITH_SEGMENT_EU")),
      us_customers: Number(required("FLAGSMITH_SEGMENT_US")),
      internal_staff: Number(required("FLAGSMITH_SEGMENT_STAFF")),
    },
    experiments: {
      production: Number(required("FLAGSMITH_EXPERIMENT_PRODUCTION")),
      simulation: Number(required("FLAGSMITH_EXPERIMENT_SIMULATION")),
    },
    simSecret: required("DRILL_SIM_SECRET"),
  };
}
