import { RemoteExpertSelector } from "./RemoteExpertSelector";
import { RemoteExpertStatus } from "./RemoteExpertStatus";
import type { RemoteExpertCatalogItem } from "../../../../../shared/remote-expert-acp/contract";
import type { RemoteExpertBindingSnapshot } from "../../../../../shared/remote-expert-acp/contract";

export function RemoteExpertContextControl(props: {
  selected: RemoteExpertCatalogItem | null;
  binding: RemoteExpertBindingSnapshot | null;
  disabled?: boolean;
  blocked?: boolean;
  onChange: (item: RemoteExpertCatalogItem | null) => void;
}) {
  return (
    <div className="remote-expert-context">
      <RemoteExpertSelector
        selected={props.selected}
        disabled={props.disabled || props.blocked}
        onChange={props.onChange}
      />
      <RemoteExpertStatus
        selected={props.selected}
        binding={props.binding}
        blocked={props.blocked}
      />
    </div>
  );
}
