'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  inviteTeammateAction,
  revokeInvitationAction,
  changeMemberRoleAction,
  removeMemberAction,
  type TeamState,
} from '@/lib/auth/team-actions';

const initial: TeamState = {};

function InviteBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      {pending ? 'Sending…' : 'Send invite'}
    </Button>
  );
}

export function InviteForm() {
  const [state, formAction] = useFormState(inviteTeammateAction, initial);
  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="teammate@company.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            name="role"
            defaultValue="member"
            className="h-10 rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 px-3 text-sm"
          >
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <InviteBtn />
      </div>
      {state?.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </div>
      ) : null}
      {state?.success ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50 dark:bg-brand-950/30 dark:border-brand-800 p-3 text-xs space-y-2">
          <div className="text-brand-800 dark:text-brand-200">{state.success}</div>
          {state.inviteLink ? (
            <div className="font-mono text-[11px] break-all bg-white dark:bg-ink-900 border border-brand-200 dark:border-brand-800 rounded px-2 py-1.5 text-ink-700 dark:text-ink-200">
              {state.inviteLink}
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

export interface MemberRow {
  userId: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
}

export function MemberTable({
  members,
  currentUserId,
  isOwner,
}: {
  members: MemberRow[];
  currentUserId: string;
  isOwner: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-ink-50 dark:bg-ink-800/40 text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
          <tr>
            <th className="text-left px-6 py-3">Member</th>
            <th className="text-left px-6 py-3">Role</th>
            <th className="text-left px-6 py-3">Joined</th>
            <th className="text-right px-6 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
          {members.map((m) => (
            <tr key={m.userId}>
              <td className="px-6 py-3">
                <div className="font-medium text-ink-900 dark:text-ink-100">{m.name}</div>
                <div className="text-xs text-ink-500 dark:text-ink-400">{m.email}</div>
              </td>
              <td className="px-6 py-3">
                {isOwner ? (
                  <form action={changeMemberRoleAction} className="inline-flex">
                    <input type="hidden" name="userId" value={m.userId} />
                    <select
                      name="role"
                      defaultValue={m.role}
                      onChange={(e) => e.currentTarget.form?.requestSubmit()}
                      className="h-8 rounded border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 px-2 text-xs"
                    >
                      <option value="owner">owner</option>
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                    </select>
                  </form>
                ) : (
                  <Badge tone="neutral" className="capitalize">
                    {m.role}
                  </Badge>
                )}
              </td>
              <td className="px-6 py-3 text-xs text-ink-500">{m.joinedAt}</td>
              <td className="px-6 py-3 text-right">
                {m.userId !== currentUserId && isOwner ? (
                  <form action={removeMemberAction}>
                    <input type="hidden" name="userId" value={m.userId} />
                    <Button type="submit" variant="ghost" size="sm" className="text-danger-600">
                      Remove
                    </Button>
                  </form>
                ) : m.userId === currentUserId ? (
                  <span className="text-xs text-ink-400">you</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface PendingInviteRow {
  id: string;
  email: string;
  role: string;
  sentAt: string;
  expiresAt: string;
}

export function PendingInvites({
  invites,
  canManage,
}: {
  invites: PendingInviteRow[];
  canManage: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-ink-50 dark:bg-ink-800/40 text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
          <tr>
            <th className="text-left px-6 py-3">Email</th>
            <th className="text-left px-6 py-3">Role</th>
            <th className="text-left px-6 py-3">Sent</th>
            <th className="text-left px-6 py-3">Expires</th>
            <th className="text-right px-6 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
          {invites.map((i) => (
            <tr key={i.id}>
              <td className="px-6 py-3 font-medium text-ink-900 dark:text-ink-100">{i.email}</td>
              <td className="px-6 py-3">
                <Badge tone="info" className="capitalize">{i.role}</Badge>
              </td>
              <td className="px-6 py-3 text-xs text-ink-500">{i.sentAt}</td>
              <td className="px-6 py-3 text-xs text-ink-500">{i.expiresAt}</td>
              <td className="px-6 py-3 text-right">
                {canManage ? (
                  <form action={revokeInvitationAction}>
                    <input type="hidden" name="invitationId" value={i.id} />
                    <Button type="submit" variant="ghost" size="sm" className="text-danger-600">
                      Revoke
                    </Button>
                  </form>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
