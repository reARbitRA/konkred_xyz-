/**
 * Manifest + demo schema validation helpers.
 * Shared by the client (catalogue/detail pages), the server (demo API) and tests.
 */

import type { ProductManifest, ProductRecord, ProductStatus } from './types.ts';

export const PRODUCT_STATUSES: ProductStatus[] = [
  'PUBLIC_DEMO',
  'STANDARD_KIT',
  'SUPERVISED_PILOT',
  'ENTERPRISE_INTEGRATION',
];

export const PRODUCT_CATEGORIES = [
  'Legal & Contracts',
  'Security & GRC',
  'Finance & Accounting',
  'M&A & Transactions',
  'Sales & Business Development',
  'Product & Engineering',
  'Marketing & Content',
  'Customer Success',
  'Data & Experimentation',
  'Executive & Strategy',
] as const;

export interface ValidationIssue {
  path: string;
  message: string;
}

export function validateManifest(manifest: ProductManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return [{ path: '$', message: 'Manifest is not an object.' }];
  }
  if (!Array.isArray(manifest.products)) {
    return [{ path: 'products', message: 'products must be an array.' }];
  }

  const slugs = new Set<string>();
  const ids = new Set<string>();

  manifest.products.forEach((product, index) => {
    const at = (field: string) => `products[${index}].${field}`;

    if (typeof product.id !== 'string' || !product.id) issues.push({ path: at('id'), message: 'required' });
    if (typeof product.slug !== 'string' || !/^[a-z0-9-]+$/.test(product.slug || '')) {
      issues.push({ path: at('slug'), message: 'must be a lowercase kebab-case slug' });
    }
    if (typeof product.name !== 'string' || !product.name) issues.push({ path: at('name'), message: 'required' });
    if (typeof product.category !== 'string' || !product.category) issues.push({ path: at('category'), message: 'required' });

    if (!PRODUCT_STATUSES.includes(product.status)) {
      issues.push({ path: at('status'), message: `invalid status "${String(product.status)}"` });
    }

    if (!['low', 'medium', 'high'].includes(product.risk)) {
      issues.push({ path: at('risk'), message: 'must be low | medium | high' });
    }
    if (typeof product.humanApprovalRequired !== 'boolean') {
      issues.push({ path: at('humanApprovalRequired'), message: 'must be boolean' });
    }
    if (product.humanApprovalRequired && product.risk === 'low') {
      issues.push({ path: at('humanApprovalRequired'), message: 'low-risk product should not require human approval' });
    }
    if (typeof product.shortDescription !== 'string' || product.shortDescription.length < 10) {
      issues.push({ path: at('shortDescription'), message: 'required, min 10 chars' });
    }
    if (typeof product.description !== 'string' || product.description.length < 40) {
      issues.push({ path: at('description'), message: 'required, min 40 chars' });
    }
    if (typeof product.prompt !== 'string' || product.prompt.length < 40) {
      issues.push({ path: at('prompt'), message: 'canonical prompt required, min 40 chars' });
    }
    if (!product.inputSchema || typeof product.inputSchema !== 'object') {
      issues.push({ path: at('inputSchema'), message: 'required' });
    }
    if (!product.outputSchema || typeof product.outputSchema !== 'object') {
      issues.push({ path: at('outputSchema'), message: 'required' });
    }

    if (product.demoStatus) {
      if (typeof product.demoStatus.available !== 'boolean') {
        issues.push({ path: at('demoStatus.available'), message: 'must be boolean' });
      }
      if (product.demoStatus.available && typeof product.demoStatus.fixturePath !== 'string') {
        issues.push({ path: at('demoStatus.fixturePath'), message: 'available demos must reference a fixture' });
      }
    } else {
      issues.push({ path: at('demoStatus'), message: 'required' });
    }

    if (!product.validationReport || !['pending', 'available'].includes(product.validationReport.status)) {
      issues.push({ path: at('validationReport.status'), message: 'must be pending | available' });
    }

    if (!Array.isArray(product.limitations) || product.limitations.length === 0) {
      issues.push({ path: at('limitations'), message: 'at least one limitation statement required' });
    }

    // No fabricated social proof / scores allowed in manifest records.
    for (const banned of ['rating', 'ratings', 'reviewCount', 'salesCount', 'viewCount', 'auditScore', 'certified', 'certification', 'accuracyRate', 'roi']) {
      if (JSON.stringify(product).toLowerCase().includes(`"${banned}"`)) {
        issues.push({ path: at(banned), message: `forbidden fabricated field "${banned}" present` });
      }
    }

    if (product.id) {
      if (ids.has(product.id)) issues.push({ path: at('id'), message: `duplicate id ${product.id}` });
      ids.add(product.id);
    }
    if (product.slug) {
      if (slugs.has(product.slug)) issues.push({ path: at('slug'), message: `duplicate slug ${product.slug}` });
      slugs.add(product.slug);
    }
  });

  if (manifest.products.length < 15) {
    issues.push({ path: 'products', message: `expected 15 products, found ${manifest.products.length}` });
  }

  return issues;
}

/**
 * Validate a product inquiry lead form (test-mode monetization).
 * Returns a list of human-readable errors; empty array = valid.
 */
export interface InquiryFormValues {
  name: string;
  email: string;
  company?: string;
  message?: string;
  acceptedTerms: boolean;
}

export function validateInquiryForm(values: InquiryFormValues): string[] {
  const errors: string[] = [];
  if (!values.name.trim()) errors.push('Name is required.');
  if (!values.email.trim()) errors.push('Work email is required.');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.push('Work email is not a valid email address.');
  }
  if (!values.acceptedTerms) {
    errors.push('You must accept the terms and privacy notice to continue.');
  }
  return errors;
}

/**
 * Validate a demo input payload against a product's input schema (JSON Schema subset).
 * Returns a list of missing/invalid field messages. Empty array = valid.
 */
export function validateDemoInput(product: ProductRecord, payload: unknown): string[] {
  const schema = product.inputSchema as { type?: string; required?: string[]; properties?: Record<string, any> };
  if (!schema || schema.type !== 'object' || !schema.properties) {
    return ['Product input schema is not defined.'];
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['Input payload must be an object.'];
  }
  const errors: string[] = [];
  const value = payload as Record<string, unknown>;

  for (const key of schema.required || []) {
    if (value[key] === undefined || value[key] === null || value[key] === '') {
      errors.push(`Missing required input: ${key}`);
    }
  }

  for (const [key, prop] of Object.entries(schema.properties || {})) {
    if (value[key] === undefined) continue;
    if (prop.type === 'string' && typeof value[key] !== 'string') {
      errors.push(`Field "${key}" must be a string.`);
    } else if (prop.type === 'number' && typeof value[key] !== 'number') {
      errors.push(`Field "${key}" must be a number.`);
    } else if (prop.type === 'array' && !Array.isArray(value[key])) {
      errors.push(`Field "${key}" must be an array.`);
    } else if (prop.type === 'object' && (typeof value[key] !== 'object' || Array.isArray(value[key]))) {
      errors.push(`Field "${key}" must be an object.`);
    }
    if (prop.type === 'string' && typeof value[key] === 'string' && prop.minLength && value[key].length < prop.minLength) {
      errors.push(`Field "${key}" must be at least ${prop.minLength} characters.`);
    }
  }

  return errors;
}

/**
 * Validate a model output against a product's output schema (JSON Schema subset).
 * Returns a list of problems; empty array = valid.
 */
export function validateDemoOutput(product: ProductRecord, output: unknown): string[] {
  const schema = product.outputSchema as { type?: string; required?: string[]; properties?: Record<string, any> };
  if (!schema || schema.type !== 'object') {
    return ['Product output schema is not defined.'];
  }
  if (output === null || typeof output !== 'object' || Array.isArray(output)) {
    return ['Model output must be an object.'];
  }
  const errors: string[] = [];
  const value = output as Record<string, unknown>;

  for (const key of schema.required || []) {
    if (value[key] === undefined || value[key] === null || value[key] === '') {
      errors.push(`Output missing required field: ${key}`);
    }
  }
  for (const [key, prop] of Object.entries(schema.properties || {})) {
    if (value[key] === undefined) continue;
    if (prop.type === 'string' && typeof value[key] !== 'string') {
      errors.push(`Output field "${key}" must be a string.`);
    } else if (prop.type === 'number' && typeof value[key] !== 'number') {
      errors.push(`Output field "${key}" must be a number.`);
    } else if (prop.type === 'boolean' && typeof value[key] !== 'boolean') {
      errors.push(`Output field "${key}" must be a boolean.`);
    } else if (prop.type === 'array' && !Array.isArray(value[key])) {
      errors.push(`Output field "${key}" must be an array.`);
    } else if (prop.type === 'object' && (typeof value[key] !== 'object' || Array.isArray(value[key]))) {
      errors.push(`Output field "${key}" must be an object.`);
    }
    if (prop.type === 'string' && Array.isArray(prop.enum) && !prop.enum.includes(value[key])) {
      errors.push(`Output field "${key}" has unsupported value.`);
    }
    // Recurse into array items using the item schema.
    if (prop.type === 'array' && Array.isArray(value[key]) && prop.items && typeof prop.items === 'object') {
      const itemSchema = prop.items as { type?: string; required?: string[]; properties?: Record<string, any>; enum?: unknown[] };
      (value[key] as unknown[]).forEach((item, index) => {
        // Scalar item schemas are checked as scalars. Treating every declared
        // item schema as an object made string arrays such as
        // ab-experiment-interpretation.significanceCaveats impossible to
        // satisfy: a correct ["..."] was rejected as "must be an object".
        if (itemSchema.type === 'string' || itemSchema.type === 'number' || itemSchema.type === 'boolean') {
          if (typeof item !== itemSchema.type) {
            errors.push(`Output field "${key}[${index}]" must be a ${itemSchema.type}.`);
            return;
          }
          if (itemSchema.type === 'string' && Array.isArray(itemSchema.enum) && !itemSchema.enum.includes(item)) {
            errors.push(`Output field "${key}[${index}]" has unsupported value.`);
          }
          return;
        }
        if (typeof item !== 'object' || item === null) {
          errors.push(`Output field "${key}[${index}]" must be an object.`);
          return;
        }
        const itemValue = item as Record<string, unknown>;
        for (const req of itemSchema.required || []) {
          if (itemValue[req] === undefined || itemValue[req] === null || itemValue[req] === '') {
            errors.push(`Output field "${key}[${index}].${req}" is required.`);
          }
        }
        for (const [itemKey, itemProp] of Object.entries(itemSchema.properties || {})) {
          const v = itemValue[itemKey];
          if (v === undefined) continue;
          if (itemProp.type === 'string' && typeof v !== 'string') {
            errors.push(`Output field "${key}[${index}].${itemKey}" must be a string.`);
          } else if (itemProp.type === 'number' && typeof v !== 'number') {
            errors.push(`Output field "${key}[${index}].${itemKey}" must be a number.`);
          } else if (itemProp.type === 'boolean' && typeof v !== 'boolean') {
            errors.push(`Output field "${key}[${index}].${itemKey}" must be a boolean.`);
          }
          if (itemProp.type === 'string' && Array.isArray(itemProp.enum) && !itemProp.enum.includes(v)) {
            errors.push(`Output field "${key}[${index}].${itemKey}" has unsupported value.`);
          }
        }
      });
    }
  }
  return errors;
}
