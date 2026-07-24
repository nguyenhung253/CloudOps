/** Supported cloud providers for the shared resource model (MVP: AWS). */
export type CloudResourceProvider = 'AWS';

/**
 * Canonical resource types — all four are supported by the direct sync pipeline.
 */
export const RESOURCE_TYPES = {
  EC2_INSTANCE: 'EC2_INSTANCE',
  EBS_VOLUME: 'EBS_VOLUME',
  SECURITY_GROUP: 'SECURITY_GROUP',
  APPLICATION_LOAD_BALANCER: 'APPLICATION_LOAD_BALANCER',
} as const;

export type ResourceType = (typeof RESOURCE_TYPES)[keyof typeof RESOURCE_TYPES];

/** Resource types currently implemented by the direct sync pipeline. */
export const SYNC_SUPPORTED_RESOURCE_TYPES: ResourceType[] = [
  RESOURCE_TYPES.EC2_INSTANCE,
  RESOURCE_TYPES.EBS_VOLUME,
  RESOURCE_TYPES.SECURITY_GROUP,
  RESOURCE_TYPES.APPLICATION_LOAD_BALANCER,
];

/**
 * Provider-agnostic snapshot produced by cloud adapters before persistence.
 */
export interface CloudResourceSnapshot {
  provider: CloudResourceProvider;
  cloudAccountId: string;
  region: string;
  resourceType: ResourceType | string;
  providerResourceId: string;
  name?: string;
  status?: string;
  tags: Record<string, string>;
  metadata: Record<string, unknown>;
}
