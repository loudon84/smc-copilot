import type { RemoteExpertCatalogItem } from "../../../../../shared/remote-expert-acp/contract";
import type { RemoteExpertBindingSnapshot } from "../../../../../shared/remote-expert-acp/contract";

export function RemoteExpertStatus(props: {
  selected: RemoteExpertCatalogItem | null;
  binding: RemoteExpertBindingSnapshot | null;
  blocked?: boolean;
}) {
  if (props.blocked) {
    return <span>Remote Expert resume blocked</span>;
  }
  if (props.binding) {
    return <span>Remote Expert: {props.binding.profileName}</span>;
  }
  if (props.selected) {
    return <span>Remote Expert: {props.selected.display_name}</span>;
  }
  return null;
}
