import { recognize } from '../api/scan';
import { useAction } from './useResource';
export const useRecognize = () => useAction(recognize);
