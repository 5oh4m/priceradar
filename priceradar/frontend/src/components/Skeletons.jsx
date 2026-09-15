/** Skeleton comparison blocks shown while a search is in flight. */
export default function Skeletons({ count = 3 }) {
  return (
    <div className="sk-wrap" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <section className="block sk" key={i}>
          <div className="block-head">
            <div className="thumb sk-box" />
            <div className="block-id">
              <div className="sk-line w60" />
              <div className="sk-line w40" />
              <div className="sk-line w30" />
            </div>
            <div className="headline">
              <div className="sk-line w50" />
              <div className="sk-line w70 tall" />
              <div className="sk-line w40" />
            </div>
          </div>
          <div className="sk-rows">
            {Array.from({ length: 4 }).map((__, r) => (
              <div className="sk-line w90" key={r} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
