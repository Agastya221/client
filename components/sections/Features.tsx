import React from 'react';

const features = [
  {
    title: 'Lightning Fast',
    description: 'Built on edge technology ensuring zero latency across the globe.',
    icon: '⚡',
  },
  {
    title: 'Secure by Default',
    description: 'Bank-grade encryption protecting your data at rest and in transit.',
    icon: '🔒',
  },
  {
    title: 'Seamless Integrations',
    description: 'Connect instantly with your favorite tools and workflows.',
    icon: '🔗',
  },
];

export default function Features() {
  return (
    <section className="py-24 bg-neutral-50 dark:bg-neutral-900 border-y border-neutral-200 dark:border-neutral-800">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything you need to scale</h2>
          <p className="text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
            Our platform provides all the tools you need to build, launch, and scale your application effortlessly.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div key={index} className="p-8 rounded-2xl bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 shadow-sm hover:shadow-md transition-shadow">
              <div className="text-4xl mb-6">{feature.icon}</div>
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-neutral-600 dark:text-neutral-400">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
