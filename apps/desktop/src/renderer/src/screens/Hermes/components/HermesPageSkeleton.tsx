export function HermesPageSkeleton() {
  return (
    <div className="hermes-page-skeleton" aria-busy="true">
      <div className="hermes-page-skeleton__bar" />
      <div className="hermes-page-skeleton__bar hermes-page-skeleton__bar--short" />
      <div className="hermes-page-skeleton__block" />
    </div>
  );
}
