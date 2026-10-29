'use strict';
// Small converter for the explicit body validators used by social routes.
function schema(description) {
  const out = { type: description.type };
  if (description.keys) {
    out.additionalProperties = false;
    out.properties = Object.fromEntries(Object.entries(description.keys).map(([key, value]) => [key, schema(value)]));
    out.required = Object.entries(description.keys).filter(([, value]) => value.flags?.presence === 'required').map(([key]) => key);
  }
  if (description.items) out.items = schema(description.items[0]);
  if (description.flags?.only) out.enum = description.allow;
  for (const rule of description.rules || []) {
    if (rule.name === 'integer') out.type = 'integer';
    if (rule.name === 'pattern') out.pattern = rule.args.regex.toString().slice(1, -1);
    if (['min', 'max'].includes(rule.name)) out[out.type === 'string' ? `${rule.name}Length` : out.type === 'array' ? `${rule.name}Items` : out.type === 'object' ? `${rule.name}Properties` : rule.name === 'min' ? 'minimum' : 'maximum'] = rule.args.limit;
    if (rule.name === 'unique') out.uniqueItems = true;
    if (rule.name === 'hex') out.pattern = '^[a-fA-F0-9]+$';
    if (rule.name === 'length') { out.minLength = rule.args.limit; out.maxLength = rule.args.limit; }
  }
  return out;
}
module.exports = schema;
