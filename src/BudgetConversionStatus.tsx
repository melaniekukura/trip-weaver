export function BudgetConversionStatus({ error, retry, rateDate }: { error: boolean; retry: () => void; rateDate?: string }) {
  if (error) return <p role="alert" className="search-error">Currency conversion unavailable. <button type="button" className="text-button" onClick={retry}>Retry</button></p>;
  return rateDate ? <details className="budget-allocation-details"><summary>Exchange rates</summary>
    <p className="field-hint">Estimated using <a href="https://frankfurter.dev/" target="_blank" rel="noreferrer">Frankfurter / ECB</a> reference rates from {rateDate}.</p>
  </details> : null;
}
