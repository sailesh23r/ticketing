// Convex auth config
// Read Better Auth JWT provider settings from environment variables so Convex
// can verify tokens issued by Better Auth. Supports configurable algorithm
// (e.g. ES256, RS256, EdDSA) and a sensible default jwks path when only issuer
// is provided.

const issuer = process.env.AUTH_JWT_ISSUER;
let jwks = process.env.AUTH_JWKS_URL;
const applicationID = process.env.AUTH_JWT_AUDIENCE;
// Allow overriding the JWT algorithm; default to ES256 for existing setups.
const algorithm = (process.env.AUTH_JWT_ALG || "ES256").toUpperCase();

// If a jwks URL wasn't provided but an issuer is set, assume the standard
// well-known jwks path at `${issuer}/.well-known/jwks.json`.
if (!jwks && issuer) {
  try {
    const base = issuer.replace(/\/+$/u, "");
    jwks = `${base}/.well-known/jwks.json`;
  } catch {
    jwks = undefined as unknown as string;
  }
}

const providers =
  issuer && jwks
    ? [
        {
          type: "customJwt",
          issuer,
          jwks,
          ...(applicationID ? { applicationID } : {}),
          algorithm,
        },
      ]
    : [];

export default { providers } as const;
