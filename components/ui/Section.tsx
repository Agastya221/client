interface SectionProps {
  title: string;
  children: React.ReactNode;
  bgLevel?: "surface" | "surface-container-low" | "surface-container";
}

export default function Section({ title, children, bgLevel = "surface" }: SectionProps) {
  const bgClasses = {
    "surface": "bg-surface",
    "surface-container-low": "bg-surface-container-low",
    "surface-container": "bg-surface-container"
  };

  return (
    <section className={`py-16 ${bgClasses[bgLevel]}`}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-[2px] h-6 bg-primary rounded-full shadow-ambient" />
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {title}
          </h2>
        </div>
        {children}
      </div>
    </section>
  );
}
