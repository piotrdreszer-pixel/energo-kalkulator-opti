import { Navigate, useParams } from 'react-router-dom';

export function LegacyProjectReportRedirect() {
  const { projectId } = useParams<{ projectId: string }>();
  return <Navigate to={`/projects/${projectId}`} replace />;
}
