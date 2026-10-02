import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * People a lead can be assigned to.
 * Manager → themselves + their field employees. Admin → all active managers and field employees.
 */
export function useAssignees(enabled = true) {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!enabled || !user || user.role === 'FIELD_VISITOR') return;
    let alive = true;
    const load = async () => {
      if (user.role === 'MANAGER') {
        const r = await api.get('/users/options');
        return [{ id: user.id, name: `${user.name} (me)`, role: 'MANAGER' }, ...r.data.data.filter((x) => x.isActive).map((x) => ({ ...x, role: 'FIELD_VISITOR' }))];
      }
      const [m, e] = await Promise.all([api.get('/users/options', { params: { role: 'MANAGER' } }), api.get('/users/options')]);
      return [
        ...m.data.data.filter((x) => x.isActive).map((x) => ({ ...x, role: 'MANAGER', name: `${x.name} (manager)` })),
        ...e.data.data.filter((x) => x.isActive).map((x) => ({ ...x, role: 'FIELD_VISITOR' })),
      ];
    };
    load()
      .then((l) => alive && setList(l))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled, user]);
  return list;
}
