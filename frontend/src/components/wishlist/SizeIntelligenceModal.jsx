import React, { useEffect } from 'react';
import { Icon } from '../Icons';
import { formatRange } from '../../lib/units';

const MEASURE_LABELS = {
  bust: 'Bust',
  waist: 'Waist',
  hips: 'Hips',
  shoulder: 'Shoulder',
  inseam: 'Inseam',
};

export function SizeIntelligenceModal({ product, result, loading = false, unit, onClose, onGoToProfile }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!product) return null;

  const chartKeys = result?.chart ? Object.keys(result.chart.sizes[0]).filter((k) => k !== 'size') : [];

  return (
    <div className="wl-modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="wl-modal wl-size-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="size-modal-title"
      >
        <div className="wl-modal-head">
          <div>
            <p className="wl-eyebrow">
              <span>{result?.brand || product.brand}</span>
              <span aria-hidden="true">·</span>
              <span>{product.category}</span>
              <span className="wl-sample-tag">
                {result?.source === 'backend-mcp' ? 'Backend MCP chart (synthetic)' : 'Sample size chart'}
              </span>
              {result?.confidence && (
                <span className="wl-window-pill">{result.confidence} confidence</span>
              )}
            </p>
            <h2 id="size-modal-title">{product.name}</h2>
          </div>
          <button className="wl-icon-btn" type="button" aria-label="Close size recommendation" onClick={onClose}>
            <Icon name="i-x" />
          </button>
        </div>

        {loading ? (
          <div className="wl-rec-box">
            <p className="wl-rec-explain">
              <span className="spinner" aria-hidden="true" /> Checking {product.brand} chart via backend Wishlist MCP...
            </p>
          </div>
        ) : (
          <div className={`wl-rec-box is-${result?.status ?? 'no_chart'}`}>
            {result?.status === 'recommended' || result?.status === 'ambiguous' ? (
              <>
                <div className="wl-rec-badge-wrap">
                  <span className="wl-rec-label">
                    {result.status === 'ambiguous' ? 'Closest match (borderline)' : 'Recommended size'}
                  </span>
                  <strong className="wl-rec-size">
                    {result.recommendedSize}
                    {result.runnerUpSize ? <small> / {result.runnerUpSize}</small> : null}
                  </strong>
                </div>
                <p className="wl-rec-explain">{result.explanation}</p>
              </>
            ) : (
              <>
                <div className="wl-rec-badge-wrap">
                  <span className="wl-rec-label">
                    {result?.status === 'no_chart' ? 'Size chart unavailable' : 'Measurements needed'}
                  </span>
                </div>
                <p className="wl-rec-explain">{result?.explanation}</p>
              </>
            )}
          </div>
        )}

        {!loading && result?.caveats?.length > 0 && (
          <div className="wl-caveats">
            {result.caveats.map((c, i) => (
              <p key={i}>
                <Icon name="i-alert" />
                <span>{c}</span>
              </p>
            ))}
          </div>
        )}

        {!loading && result?.rows?.length > 0 && (
          <div className="wl-section-block">
            <h3>Measurement comparison ({unit})</h3>
            <div className="wl-table-wrap">
              <table className="wl-table">
                <thead>
                  <tr>
                    <th>Body area</th>
                    <th>Your profile</th>
                    <th>{result.brand} ({result.recommendedSize})</th>
                    <th>Fit</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td className="num">{r.userFormatted}</td>
                      <td className="num">{r.rangeFormatted}</td>
                      <td>
                        <span className={`wl-verdict is-${r.status}`}>{r.verdict}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && result?.chart && (
          <div className="wl-section-block">
            <div className="wl-chart-head">
              <h3>{result.brand} {product.category.toLowerCase()} chart</h3>
              <span className="wl-chart-note">{result.chart.note}</span>
            </div>
            <div className="wl-table-wrap">
              <table className="wl-table">
                <thead>
                  <tr>
                    <th>Size</th>
                    {chartKeys.map((k) => (
                      <th key={k}>{MEASURE_LABELS[k] ?? k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.chart.sizes.map((row) => {
                    const isRec = row.size === result.recommendedSize;
                    const isAlt = row.size === result.runnerUpSize;
                    return (
                      <tr key={row.size} className={isRec ? 'is-active' : isAlt ? 'is-alt' : undefined}>
                        <td>
                          <strong>{row.size}</strong>
                          {isRec && <span className="wl-row-tag">Recommended</span>}
                          {isAlt && <span className="wl-row-tag is-alt">Close</span>}
                        </td>
                        {chartKeys.map((k) => (
                          <td key={k} className="num">
                            {formatRange(row[k][0], row[k][1], unit)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="wl-modal-foot">
          <button
            className="btn btn-quiet"
            type="button"
            onClick={() => {
              onClose();
              onGoToProfile();
            }}
          >
            <Icon name="i-ruler" />
            Edit My Size Profile
          </button>
          <button className="btn btn-primary" type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

