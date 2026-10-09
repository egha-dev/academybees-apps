import { ErrorEnvelopeSchema } from '@academybee/contracts';
import { RequestMethod, VERSION_NEUTRAL } from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
  VERSION_METADATA,
} from '@nestjs/common/constants.js';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
import type { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { z } from 'zod';

import { isZodDto, ZOD_RESPONSE } from '../validation/zod-dto.js';

type JsonSchema = Record<string, unknown>;
type Operation = Record<string, unknown>;

const toSchema = (schema: z.ZodType): JsonSchema =>
  z.toJSONSchema(schema, { target: 'draft-2020-12', unrepresentable: 'any', io: 'input' });

function joinPath(...parts: string[]): string {
  const path = `/${parts
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')}`;
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function versions(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value ?? VERSION_NEUTRAL];
  return list.map((v) => (v === VERSION_NEUTRAL ? '' : `v${String(v)}`));
}

/**
 * OpenAPI 3.1 generated from the Zod schemas attached to routes (`createZodDto` params and
 * `@ZodResponse`) — ADR-012. Served at /api/docs outside production.
 */
export function buildOpenApi(
  discovery: DiscoveryService,
  scanner: MetadataScanner,
  prefix = 'api',
) {
  const paths: Record<string, Record<string, Operation>> = {};

  for (const wrapper of discovery.getControllers()) {
    const instance = wrapper.instance as object | undefined;
    const metatype = wrapper.metatype as (abstract new (...args: never[]) => unknown) | null;
    if (!instance || !metatype) continue;
    const controllerPath = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '');
    const controllerVersion: unknown = Reflect.getMetadata(VERSION_METADATA, metatype);
    const proto = Object.getPrototypeOf(instance) as object;

    for (const name of scanner.getAllMethodNames(proto)) {
      const handler = (proto as Record<string, unknown>)[name] as (...args: unknown[]) => unknown;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined) continue;
      const routePath = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '');
      const version: unknown = Reflect.getMetadata(VERSION_METADATA, handler) ?? controllerVersion;

      const operation: Operation = {
        operationId: `${metatype.name}.${name}`,
        tags: [metatype.name.replace(/Controller$/, '')],
        responses: {
          default: {
            description: 'Error envelope',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
            },
          },
        },
      };

      const paramTypes = (Reflect.getMetadata('design:paramtypes', proto, name) ?? []) as unknown[];
      const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, metatype, name) ?? {}) as Record<
        string,
        { index: number }
      >;
      for (const [argKey, { index }] of Object.entries(args)) {
        const type = paramTypes[index];
        if (!isZodDto(type)) continue;
        const kind = Number(argKey.split(':')[0]);
        const schema = toSchema(type.schema);
        if (kind === Number(RouteParamtypes.BODY)) {
          operation.requestBody = { required: true, content: { 'application/json': { schema } } };
        } else if (kind === Number(RouteParamtypes.QUERY)) {
          const props = (schema.properties ?? {}) as Record<string, JsonSchema>;
          const required = new Set((schema.required ?? []) as string[]);
          operation.parameters = Object.entries(props).map(([n, s]) => ({
            name: n,
            in: 'query',
            required: required.has(n),
            schema: s,
          }));
        }
      }

      const response = Reflect.getMetadata(ZOD_RESPONSE, handler) as z.ZodType | undefined;
      (operation.responses as Record<string, unknown>)['200'] = {
        description: 'Success',
        ...(response ? { content: { 'application/json': { schema: toSchema(response) } } } : {}),
      };

      const httpMethod = RequestMethod[method].toLowerCase();
      for (const v of versions(version)) {
        const path = joinPath(prefix, v, controllerPath, routePath);
        (paths[path] ??= {})[httpMethod] = operation;
      }
    }
  }

  return {
    openapi: '3.1.0',
    info: { title: 'AcademyBee API', version: '0.x' },
    paths,
    components: { schemas: { ErrorEnvelope: toSchema(ErrorEnvelopeSchema) } },
  };
}
