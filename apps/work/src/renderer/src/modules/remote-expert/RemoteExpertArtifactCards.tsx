import { useI18n } from "../../components/useI18n";

export function RemoteExpertArtifactCards(props: {
  files: Array<{ id: string; name: string }>;
  onOpen: (fileId: string) => void;
}) {
  const { t } = useI18n();
  if (props.files.length === 0) return null;
  return (
    <div className="remote-expert-artifacts">
      <div>{t("remoteExpert.label")}</div>
      <ul>
        {props.files.map((file) => (
          <li key={file.id}>
            <button type="button" onClick={() => props.onOpen(file.id)}>
              {file.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
