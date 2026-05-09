import React from 'react';
import { motion } from 'motion/react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, MessageSquare, Heart, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NewsCardProps {
  title: string;
  summary: string;
  imageUrl?: string;
  source: string;
  publishedAt: string;
  sentiment: 'Positivo' | 'Negativo' | 'Neutro';
  tags: string[];
  onClick?: () => void;
  isFavorited?: boolean;
  onFavoriteToggle?: (e: React.MouseEvent) => void;
}

const NewsCard: React.FC<NewsCardProps> = ({
  title,
  summary,
  imageUrl,
  source,
  publishedAt,
  sentiment,
  tags,
  onClick,
  isFavorited,
  onFavoriteToggle
}) => {
  const sentimentColor = {
    Positivo: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
    Negativo: 'bg-rose-500/20 text-rose-400 border-rose-500/50',
    Neutro: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="group cursor-pointer h-full border-b border-border pb-8 last:border-b-0"
      onClick={onClick}
    >
      <div className="flex flex-col h-full bg-transparent overflow-hidden">
        {imageUrl && (
          <div className="relative aspect-[21/9] overflow-hidden mb-6">
            <img
              src={imageUrl}
              alt={title}
              className="object-cover w-full h-full grayscale-[0.2] hover:grayscale-0 transition-all duration-700"
              loading="lazy"
            />
            <div className="absolute top-4 left-4">
              <span className={cn("px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-foreground text-background", sentimentColor[sentiment].split(' ')[0])}>
                {sentiment}
              </span>
            </div>
          </div>
        )}

        <div className="flex-grow">
          <div className="flex items-center gap-3 mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-blue-500">
            {source}
            <span className="w-1 h-1 rounded-full bg-border" />
            <span className="text-muted-foreground">
              {new Date(publishedAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
          <h3 className="text-2xl font-bold font-serif leading-tight text-foreground group-hover:text-blue-500 transition-colors mb-4">
            {title}
          </h3>
          <p className="text-base text-foreground/70 leading-relaxed font-serif font-light mb-6 line-clamp-3 italic">
            "{summary}"
          </p>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex flex-wrap gap-4">
            {tags.map((tag) => (
              <span 
                key={tag} 
                className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors"
              >
                #{tag}
              </span>
            ))}
          </div>
          <div className="ml-auto flex gap-4">
            <button 
              onClick={onFavoriteToggle}
              className={cn(
                "transition-colors",
                isFavorited ? "text-red-500" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Heart size={14} fill={isFavorited ? "currentColor" : "none"} />
            </button>
            <button className="text-muted-foreground hover:text-foreground transition-colors"><Share2 size={14} /></button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default NewsCard;
