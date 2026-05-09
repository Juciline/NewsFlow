import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const NewsSkeleton = () => {
  return (
    <div className="border-b border-border pb-8 space-y-6">
      {/* Image Skeleton */}
      <Skeleton className="aspect-[21/9] w-full bg-muted" />
      
      <div className="space-y-4">
        {/* Source & Date Skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-3 w-20 bg-muted" />
          <div className="w-1 h-1 rounded-full bg-border" />
          <Skeleton className="h-3 w-32 bg-muted" />
        </div>
        
        {/* Title Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-8 w-full bg-muted/60" />
          <Skeleton className="h-8 w-[80%] bg-muted/60" />
        </div>
        
        {/* Summary Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-full bg-muted/40" />
          <Skeleton className="h-4 w-full bg-muted/40" />
          <Skeleton className="h-4 w-[60%] bg-muted/40" />
        </div>
      </div>
      
      {/* Footer Skeleton */}
      <div className="flex justify-between items-center">
        <div className="flex gap-4">
          <Skeleton className="h-3 w-12 bg-muted/40" />
          <Skeleton className="h-3 w-12 bg-muted/40" />
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-4 w-4 rounded-full bg-muted/40" />
          <Skeleton className="h-4 w-4 rounded-full bg-muted/40" />
        </div>
      </div>
    </div>
  );
};

export default NewsSkeleton;
