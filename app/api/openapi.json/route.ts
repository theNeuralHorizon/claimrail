import { NextResponse } from 'next/server';

/**
 * OpenAPI 3.1 spec for the ClaimRail public REST API.
 *
 * Kept in-tree as a static object so swagger/redoc can render it without
 * hitting the DB and so editors can jump-to-definition. Update this when
 * new endpoints land.
 */
const spec = {
  openapi: '3.1.0',
  info: {
    title: 'ClaimRail API',
    version: '1.0.0',
    description:
      'Public REST API for ClaimRail. Authenticate with a bearer token created in Settings → API tokens. Tokens are scoped read or write. All endpoints rate-limit per-token (60/min read, 30/min write).',
    license: { name: 'MIT' },
  },
  servers: [{ url: '{baseUrl}', variables: { baseUrl: { default: 'http://localhost:3000' } } }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'crt_<token>',
        description: "Tokens have the format crt_<random> and can be rotated from Settings.",
      },
    },
    schemas: {
      Breach: {
        type: 'object',
        properties: {
          hasBreach: { type: 'boolean' },
          threshold: { type: 'number', nullable: true },
          creditPct: { type: 'number' },
          estimatedCreditCents: { type: 'integer' },
        },
      },
      Vendor: {
        type: 'object',
        required: ['id', 'name', 'monitorUrl', 'monthlySpendCents'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          monitorUrl: { type: 'string', format: 'uri' },
          monthlySpendCents: { type: 'integer', minimum: 0 },
          currentPeriod: { type: 'string', example: '2026-04' },
          uptimePct: { type: 'number' },
          breach: { $ref: '#/components/schemas/Breach' },
        },
      },
      VendorCreate: {
        type: 'object',
        required: ['name', 'monitorUrl', 'monthlySpendCents', 'tiers'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', maxLength: 100 },
          monitorUrl: { type: 'string', format: 'uri' },
          monthlySpendCents: { type: 'integer', minimum: 0 },
          contactEmail: { type: 'string', format: 'email' },
          notes: { type: 'string', maxLength: 2000 },
          tiers: {
            type: 'array',
            minItems: 1,
            maxItems: 10,
            items: {
              type: 'object',
              required: ['uptimeThresholdPct', 'creditPct'],
              additionalProperties: false,
              properties: {
                uptimeThresholdPct: { type: 'number', minimum: 50, maximum: 100 },
                creditPct: { type: 'number', exclusiveMinimum: 0, maximum: 100 },
                sourceExcerpt: { type: 'string', maxLength: 500 },
              },
            },
          },
        },
      },
      Claim: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          vendorId: { type: 'string' },
          vendorName: { type: 'string' },
          period: { type: 'string', example: '2026-03' },
          status: { type: 'string', enum: ['drafted', 'filed', 'acknowledged', 'recovered', 'rejected'] },
          measuredUptimePct: { type: 'number' },
          threshold: { type: 'number' },
          creditPct: { type: 'number' },
          estimatedCreditCents: { type: 'integer' },
          recoveredCents: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          filedAt: { type: 'string', format: 'date-time', nullable: true },
          resolvedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
      },
    },
  },
  paths: {
    '/api/v1/vendors': {
      get: {
        summary: 'List vendors',
        description: 'Returns every vendor visible to the token, with current-period uptime + breach state.',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Vendor' } },
                    meta: { type: 'object' },
                  },
                },
              },
            },
          },
          '401': { description: 'Missing or invalid token', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'Rate limited' },
        },
      },
      post: {
        summary: 'Create a vendor',
        description: 'Requires a write-scope token. Pass a list of SLA tiers to configure breach detection immediately.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/VendorCreate' } },
          },
        },
        responses: {
          '201': {
            description: 'Created',
            content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' } } } } },
          },
          '400': { description: 'Invalid input' },
          '401': { description: 'Missing or invalid token' },
          '403': { description: 'Requires write scope' },
          '415': { description: 'Content-Type must be application/json' },
          '429': { description: 'Rate limited' },
        },
      },
    },
    '/api/v1/claims': {
      get: {
        summary: 'List claims',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Claim' } },
                    meta: { type: 'object' },
                  },
                },
              },
            },
          },
          '401': { description: 'Missing or invalid token' },
          '429': { description: 'Rate limited' },
        },
      },
    },
  },
} as const;

export function GET() {
  return NextResponse.json(spec, {
    headers: {
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
