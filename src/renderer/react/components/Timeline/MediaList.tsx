import React from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import MediaItem from './MediaItem';

interface MediaListProps {
  mediaFiles: any[];
  thumbnails: Record<string, string>;
  selectedMedias: string[];
  selectedMedia: any | null;
  measuringLoudness: Record<string, boolean>;
  loudnessErrors: Record<string, string>;
  formatDuration: (seconds: number) => string;
  formatFileSize: (bytes: number) => string;
  onDragEnd: (result: DropResult) => void;
  onMediaClick: (mediaId: string, e: React.MouseEvent) => void;
  onMeasureLoudness: (media: any, e: React.MouseEvent) => void;
  onToggleLoudnessNormalization: (media: any, e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * タイムライン内のメディアリスト全体を表示するコンポーネント
 */
const MediaList: React.FC<MediaListProps> = ({
  mediaFiles,
  thumbnails,
  selectedMedias,
  selectedMedia,
  measuringLoudness,
  loudnessErrors,
  formatDuration,
  formatFileSize,
  onDragEnd,
  onMediaClick,
  onMeasureLoudness,
  onToggleLoudnessNormalization
}) => {
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="timeline">
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="media-list"
          >
            {mediaFiles.map((media, index) => (
              <Draggable key={media.id} draggableId={media.id} index={index}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className="media-item-container"
                  >
                    <MediaItem
                      media={media}
                      thumbnail={thumbnails[media.id] || null}
                      isSelected={selectedMedias.includes(media.id)}
                      isActive={selectedMedia?.id === media.id}
                      formatDuration={formatDuration}
                      formatFileSize={formatFileSize}
                      measuringLoudness={measuringLoudness}
                      loudnessErrors={loudnessErrors}
                      onMediaClick={onMediaClick}
                      onMeasureLoudness={onMeasureLoudness}
                      onToggleLoudnessNormalization={onToggleLoudnessNormalization}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};

export default MediaList;
