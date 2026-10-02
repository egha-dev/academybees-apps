import { type INestApplication, RequestMethod, VERSION_NEUTRAL } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';

import { IS_PUBLIC } from '../../src/core/auth/public.decorator.js';
import { REQUIRED_CAPABILITY, SIGNED_IN_ONLY } from '../../src/core/rbac/can.decorator.js';
import { HOST_POLICY, type HostPolicy } from '../../src/core/tenant/host-policy.js';

export type RouteInfo = {
  method: string;
  path: string;
  policy: HostPolicy['kind'];
  isPublic: boolean;
  capability: string | undefined;
  signedIn: boolean;
};

/** Every HTTP route of the app with its host policy (default: academy host). */
export function listRoutes(app: INestApplication): RouteInfo[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);
  const routes: RouteInfo[] = [];
  for (const wrapper of discovery.getControllers()) {
    const instance = wrapper.instance as object | undefined;
    const metatype = wrapper.metatype as (abstract new (...args: never[]) => unknown) | null;
    if (!instance || !metatype) continue;
    const base = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '');
    const classVersion: unknown = Reflect.getMetadata(VERSION_METADATA, metatype);
    const proto = Object.getPrototypeOf(instance) as object;
    for (const name of scanner.getAllMethodNames(proto)) {
      const handler = (proto as Record<string, unknown>)[name] as () => unknown;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined) continue;
      const sub = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '');
      const version: unknown = Reflect.getMetadata(VERSION_METADATA, handler) ?? classVersion;
      const policy = reflector.getAllAndOverride<HostPolicy | undefined>(HOST_POLICY, [
        handler,
        metatype,
      ]);
      const versions = (Array.isArray(version) ? version : [version ?? VERSION_NEUTRAL]).map(
        (v: unknown) => (v === VERSION_NEUTRAL ? '' : `v${String(v)}`),
      );
      for (const v of versions) {
        const path = `/${['api', v, base, sub]
          .map((p) => p.replace(/^\/+|\/+$/g, ''))
          .filter(Boolean)
          .join('/')}`;
        const meta = <T>(key: string) =>
          reflector.getAllAndOverride<T | undefined>(key, [handler, metatype]);
        routes.push({
          method: RequestMethod[method],
          path,
          policy: policy?.kind ?? 'tenant',
          isPublic: meta<boolean>(IS_PUBLIC) ?? false,
          capability: meta<string>(REQUIRED_CAPABILITY),
          signedIn: meta<boolean>(SIGNED_IN_ONLY) ?? false,
        });
      }
    }
  }
  return routes;
}
