export interface DesktopShellProps {
  sidebar: React.ReactNode;
  header: React.ReactNode;
  outlet: React.ReactNode;
  modalLayer?: React.ReactNode;
  drawerLayer?: React.ReactNode;
  statusBar?: React.ReactNode;
}

export function DesktopShell({
  sidebar,
  header,
  outlet,
  modalLayer,
  drawerLayer,
  statusBar,
}: DesktopShellProps): React.JSX.Element {
  return (
    <div className="layout desktop-shell">
      <aside className="desktop-shell__sidebar sidebar">{sidebar}</aside>
      <section className="desktop-shell__main">
        <header className="desktop-shell__header">{header}</header>
        <main className="desktop-shell__outlet content">{outlet}</main>
        {statusBar ? (
          <footer className="desktop-shell__status">{statusBar}</footer>
        ) : null}
      </section>
      {modalLayer}
      {drawerLayer}
    </div>
  );
}
