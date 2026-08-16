// A labelled block. `action` is the optional right-aligned control the design
// puts beside some labels (See all, Edit).

export default function Section({ label, action, children }) {
  return (
    <section className="section">
      {action ? (
        <div className="section-head">
          <span className="section-label">{label}</span>
          {action}
        </div>
      ) : (
        <span className="section-label">{label}</span>
      )}
      {children}
    </section>
  )
}
