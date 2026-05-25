import type { VideoTask } from "@/domain/schemas/api";
import { checkTimeout, type PolicyAction as TimeoutAction } from "./timeout-policy";
import { checkExpiration, type PolicyAction as ExpirationAction } from "./expiration-policy";

type PolicyAction = TimeoutAction | ExpirationAction;

interface Policy {
  name: string;
  check: (task: VideoTask) => PolicyAction;
}

const policies: Policy[] = [
  { name: "timeout", check: checkTimeout },
  { name: "expiration", check: checkExpiration },
];

export function evaluatePolicies(task: VideoTask): PolicyAction[] {
  return policies
    .map((p) => p.check(task))
    .filter((a) => a.type !== "NONE");
}
