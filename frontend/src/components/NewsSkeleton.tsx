import React from 'react';

const NewsSkeleton = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="animate-pulse space-y-4">
          <div className="bg-muted aspect-video w-full" />
          <div className="space-y-2">
            <div className="h-4 bg-muted w-3/4" />
            <div className="h-4 bg-muted w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
};

export default NewsSkeleton;
