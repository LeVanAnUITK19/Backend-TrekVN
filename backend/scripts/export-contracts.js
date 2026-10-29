'use strict';

// Export the implemented routes and physical Mongoose schemas without connecting to a DB.
// Run from any directory: node scripts/export-contracts.js
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const allServices = ['auth-service', 'checkin-service', 'trekking-service', 'community-service'];
const selectedService = process.argv[2];
if (selectedService && !allServices.includes(selectedService)) throw new Error('Unknown service: ' + selectedService);
const services = selectedService ? [selectedService] : allServices;
const write = (name, contents) => {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents + '\n');
};
const json = (name, value) => write(name, JSON.stringify(value, null, 2));
const schemas = selectedService ? JSON.parse(fs.readFileSync(path.join(root, 'docs/database/runtime/schemas.json'), 'utf8')) : {};
const routeRows = [];

function collect(file, prefix, rows, seen = new Set()) {
  const key = file + prefix;
  if (seen.has(key)) { return; }
  seen.add(key);
  const source = fs.readFileSync(file, 'utf8');
  const imports = new Map([...source.matchAll(/const\s+(\w+)\s*=\s*require\(['"](.+?)['"]\)/g)]
    .map((match) => [match[1], match[2]]));
  for (const match of source.matchAll(/router\.use\(['"]([^'"]*)['"],\s*(\w+)\)/g)) {
    if (!imports.has(match[2])) { continue; }
    let target = path.resolve(path.dirname(file), imports.get(match[2]));
    if (!target.endsWith('.js')) { target += '.js'; }
    if (fs.existsSync(target)) { collect(target, prefix + (match[1] === '/' ? '' : match[1]), rows, seen); }
  }
  for (const match of source.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"]([^'"]*)['"]/g)) {
    const url = prefix + (match[2] === '/' ? '' : match[2]);
    const call = source.slice(match.index, source.indexOf(');', match.index) + 2);
    const validatorMatch = call.match(/validate\((\w+)(?:\.(\w+))?\)/);
    let bodySchema;
    if (validatorMatch) {
      try {
        let validator;
        if (validatorMatch[2] && imports.has(validatorMatch[1])) {
          validator = require(path.resolve(path.dirname(file), imports.get(validatorMatch[1])))[validatorMatch[2]];
        } else {
          for (const dep of source.matchAll(/require\(['"]([^'"]*validators[^'"]*)['"]\)/g)) {
            const exported = require(path.resolve(path.dirname(file), dep[1]));
            validator ||= exported[validatorMatch[1]];
          }
        }
        if (validator?.describe) { bodySchema = joiSchema(validator.describe()); }
      } catch (error) { throw new Error(`${file}: ${error.message}`); }
    }
    rows.push({ method: match[1], path: url.replace(/:(\w+)/g, '{$1}'), source: path.relative(root, file).replaceAll('\\', '/'), bodySchema });
  }
}

function joiSchema(description) {
  const schema = { type: { date: 'string', any: 'object', alternatives: 'object', binary: 'string' }[description.type] || description.type };
  if (description.type === 'date') { schema.format = 'date-time'; }
  if (description.keys) {
    schema.properties = Object.fromEntries(Object.entries(description.keys).map(([name, child]) => [name, joiSchema(child)]));
    const required = Object.entries(description.keys).filter(([, child]) => child.flags?.presence === 'required').map(([name]) => name);
    if (required.length) { schema.required = required; }
  }
  if (description.items?.[0]) { schema.items = joiSchema(description.items[0]); }
  if (description.flags?.only && description.allow?.length) { schema.enum = description.allow.filter((v) => v !== null); }
  if (description.allow?.includes(null)) { schema.nullable = true; }
  if (description.flags?.default !== undefined && typeof description.flags.default !== 'object') { schema.default = description.flags.default; }
  for (const rule of description.rules || []) {
    if (rule.name === 'email') { schema.format = 'email'; }
    if (rule.name === 'uri') { schema.format = 'uri'; }
    if (rule.name === 'integer') { schema.type = 'integer'; }
    if (['min', 'max'].includes(rule.name) && typeof rule.args?.limit === 'number') {
      const prop = schema.type === 'string' ? `${rule.name}Length` : schema.type === 'array' ? `${rule.name}Items` : rule.name === 'min' ? 'minimum' : 'maximum';
      schema[prop] = rule.args.limit;
    }
    if (rule.name === 'length' && typeof rule.args?.limit === 'number' && schema.type === 'array') { schema.minItems = schema.maxItems = rule.args.limit; }
  }
  return schema;
}

for (const service of services) {
  const base = path.join(root, 'services', service);
  const requireLocal = (name) => require(require.resolve(name, { paths: [base] }));
  const rows = [];
  collect(path.join(base, 'src/routes/index.js'), '/api/v1', rows);
  if (service === 'community-service') collect(path.join(base, 'src/routes/admin.routes.js'), '/api/v1/admin/community', rows);
  const internalFile = path.join(base, 'src/routes/internal.routes.js');
  if (fs.existsSync(internalFile)) collect(internalFile, '/internal/v1', rows);
  const spec = service === 'community-service' ? require(path.join(base, 'src/config/openapi.definition')) : requireLocal('swagger-jsdoc')({
    failOnErrors: true,
    definition: {
      openapi: '3.0.0', info: { title: service, version: require(path.join(base, 'package.json')).version },
      servers: [{ url: `http://localhost:${{ 'auth-service': 3001, 'checkin-service': 3002, 'trekking-service': 3003 }[service]}` }],
      components: { securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        serviceToken: { type: 'apiKey', in: 'header', name: 'X-Service-Token' },
      } },
    },
    apis: [path.join(base, 'src/routes/*.js').replaceAll('\\', '/')],
  });
  const paths = {};
  const publicAuth = new Set(['register', 'verify-email', 'resend-verification-otp', 'login', 'refresh', 'forgot-password', 'verify-reset-otp', 'reset-password', 'google']);
  let generated = 0;
  for (const row of rows) {
    if (paths[row.path]?.[row.method]) { continue; } // Express uses the first matching handler.
    const explicit = spec.paths[row.path]?.[row.method];
    const internal = row.path.startsWith('/internal/');
    let security = [];
    if (internal) {
      security = row.path === '/internal/v1/dashboard' ? [{ bearerAuth: [] }] : [{ serviceToken: [] }];
    } else if (['checkin-service', 'community-service'].includes(service) || row.path.includes('/admin/') || row.path.includes('/users/') ||
               /\/(journeys|contributions)\b/.test(row.path) || /\/badges\/(me|users)\b/.test(row.path) ||
               row.path.includes('/uploads/') || /\/reviews\/(me|eligibility)$/.test(row.path) ||
               (row.path.includes('/reviews') && row.method !== 'get') ||
               /\/gamification\/(me|users)/.test(row.path) ||
               (row.path.startsWith('/api/v1/auth/') && !publicAuth.has(row.path.split('/').pop()))) {
      security = [{ bearerAuth: [] }];
    }
    const operation = explicit ? { ...explicit } : {
      summary: `${row.method.toUpperCase()} ${row.path}`,
      description: `Implemented in ${row.source}. See the service Markdown API guide for business rules. This generated operation describes routing and authentication; request/response details still require an explicit JSDoc contract.`,
      'x-contract-detail': 'route-only',
      responses: { '200': { description: 'Successful operation; see service API guide for response fields.' } },
    };
    if (!explicit) { generated++; }
    operation.responses ||= { default: { description: 'See the service API guide for status codes and response fields.' } };
    operation.security = operation.security || security;
    if (row.bodySchema && ['post', 'put', 'patch'].includes(row.method)) {
      operation.requestBody = { required: true, content: { 'application/json': { schema: row.bodySchema } } };
    }
    const params = operation.parameters || [];
    for (const match of row.path.matchAll(/\{(\w+)\}/g)) {
      if (!params.some((p) => p.in === 'path' && p.name === match[1])) {
        params.push({ name: match[1], in: 'path', required: true, schema: { type: 'string' } });
      }
    }
    if (params.length) { operation.parameters = params; }
    paths[row.path] ||= {};
    paths[row.path][row.method] = operation;
    routeRows.push({ service, ...row, security: operation.security, detail: explicit ? 'JSDoc' : 'route-only' });
  }
  spec.paths = paths;
  json(`docs/openapi/${service}.json`, spec);
  json(`services/${service}/src/config/openapi.json`, spec);
  console.log(`${service}: ${rows.length} route declarations, ${generated} operations still need detailed contracts`);

  const mongoose = requireLocal('mongoose');
  const modelsPath = path.join(base, 'src/models');
  const models = fs.readdirSync(modelsPath).filter((file) => file.endsWith('.js'))
    .flatMap((file) => {
      const exported = require(path.join(modelsPath, file));
      return exported.schema ? [exported] : Object.values(exported).filter((value) => value?.schema);
    });
  schemas[service] = models.filter((model) => model.schema).map((model) => ({
    model: model.modelName, collection: model.collection.name,
    fields: Object.entries(model.schema.paths).map(([name, field]) => ({
      name, type: field.instance, required: field.isRequired === true,
      ...(field.enumValues?.length ? { enum: field.enumValues } : {}),
      ...(field.options.ref ? { ref: field.options.ref } : {}),
      ...(field.options.default !== undefined && typeof field.options.default !== 'function' ? { default: field.options.default } : {}),
      ...(field.schema ? { nested: Object.entries(field.schema.paths).map(([name, child]) => ({ name, type: child.instance })) } : {}),
    })),
    indexes: model.schema.indexes().map(([keys, options]) => ({ keys, options })),
  }));
  const type = { ObjectId: 'varchar', String: 'varchar', Date: 'timestamp', Number: 'double', Boolean: 'boolean' };
  let dbml = '// Generated physical MongoDB schema. _id is ObjectId; API aliases are not stored fields.\n// Nested fields retain their MongoDB dotted paths. See schemas.json for index options and subdocuments.\n';
  for (const model of schemas[service]) {
    dbml += `\nTable ${model.collection} {\n`;
    for (const field of model.fields) {
      dbml += `  "${field.name}" ${type[field.type] || 'json'}${field.name === '_id' ? ' [pk]' : field.required ? ' [not null]' : ''}\n`;
    }
    dbml += '}\n';
  }
  write(`docs/database/runtime/${service}.dbml`, dbml);
  // All schemas are in memory only; never connect or initialize model indexes here.
  void mongoose;
}
json('docs/database/runtime/schemas.json', schemas);
const inventoryHeader = '# Implemented backend routes\n\nGenerated with `node scripts/export-contracts.js`. Route-only entries have no complete request/response specification yet. Internal endpoints are unavailable through the public Gateway.\n\n| Service | Method | Path | Auth | Contract detail |\n|---|---|---|---|---|\n';
const previousInventory = selectedService
  ? fs.readFileSync(path.join(root, 'docs/api-route-inventory.md'), 'utf8').split('\n')
    .filter((line) => !line.startsWith(`| ${selectedService} |`)).join('\n').trimEnd() + '\n'
  : inventoryHeader;
write('docs/api-route-inventory.md', previousInventory + routeRows.map((row) =>
  `| ${row.service} | ${row.method.toUpperCase()} | \`${row.path}\` | ${row.security.length ? row.security.map((s) => Object.keys(s).join('/')).join(' OR ') : 'Public'} | ${row.detail} |`).join('\n'));
