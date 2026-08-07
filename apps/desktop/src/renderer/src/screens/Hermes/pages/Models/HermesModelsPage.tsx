import { useHermesDefault } from "../../context/HermesDefaultContext";
import { HermesDefaultModelsSurface } from "./HermesDefaultModelsSurface";

export default function HermesModelsPage() {
  const { activeNavItem } = useHermesDefault();
  return <HermesDefaultModelsSurface visible={activeNavItem === "models"} />;
}
