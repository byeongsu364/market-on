import { useT } from '../../i18n';
import Button from './Button';
import s from './ui.module.css';
export default function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  const t = useT();
  return (
    <div role="alert" className={s.error}>
      <p>{message}</p>
      {retry && (
        <Button size="sm" variant="outline" onClick={retry}>
          {t('retry')}
        </Button>
      )}
    </div>
  );
}
