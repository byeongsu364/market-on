import { useT } from '../../i18n';
export default function Loading({ message }: { message?: string }) {
  const t = useT();
  return <p role="status">{message ?? t('loadingStatus')}</p>;
}
