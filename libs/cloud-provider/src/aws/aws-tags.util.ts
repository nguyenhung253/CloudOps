import type { Tag } from '@aws-sdk/client-ec2';

export function tagsToRecord(tags: Tag[] | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!tags) {
    return result;
  }
  for (const tag of tags) {
    if (tag.Key) {
      result[tag.Key] = tag.Value ?? '';
    }
  }
  return result;
}
