import { ChannelToggles, Notice, Row, Segmented, Select, SettingsLayout, Toggle } from '../components/settings'
import type { SettingsSection } from '../components/settings'
import useDraft from '../hooks/useDraft'
import { TEACHER_PROFILE } from '../data/teacherMock'
import { DEADLINE_NOTICES, DIGEST_TIMES, HOURS, TEACHER_SETTINGS, TIME_ZONES } from '../data/settingsMock'

const CONTACT_EMAIL = 'professor.a@utdallas.edu'

function ReadOnly({ children }: { children: string }) {
  return <span className="rounded-md bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700">{children}</span>
}

function TeacherSettingsPage() {
  const { draft: s, set, dirty, save, discard } = useDraft(TEACHER_SETTINGS)

  const sections: SettingsSection[] = [
    {
      id: 'profile',
      title: 'Profile',
      description: 'How you appear to the Assessment Committee and to observers',
      content: [
        <Notice key="notice" title="Your profile is managed by the Assessment Committee">
          Name, rank, contact details, hire date, and instructor level are entered by AC members, and course assignments come
          from CourseBook. Contact a committee member to correct anything here.
        </Notice>,
        <Row key="name" label="Display name" description="Shown on your profile and evaluation reports">
          <ReadOnly>{TEACHER_PROFILE.name}</ReadOnly>
        </Row>,
        <Row key="title" label="Title" description="Updated by the Assessment Committee">
          <ReadOnly>{`${TEACHER_PROFILE.rank} · Computer Science`}</ReadOnly>
        </Row>,
        <Row key="email" label="Contact email" description="Notifications and observer requests go here">
          <ReadOnly>{CONTACT_EMAIL}</ReadOnly>
        </Row>,
      ],
    },
    {
      id: 'schedule',
      title: 'Schedule',
      description: 'Defaults for your teaching schedule view',
      content: [
        <Row key="view" label="Default schedule view" description="What opens first on your schedule">
          <Segmented label="Default schedule view" options={['Day', 'Week', 'Month'] as const} value={s.scheduleView} onChange={(v) => set('scheduleView', v)} />
        </Row>,
        <Row key="week" label="Week starts on">
          <Segmented label="Week starts on" options={['Sun', 'Mon'] as const} value={s.weekStart} onChange={(v) => set('weekStart', v)} />
        </Row>,
        <Row key="hours" label="Visible hours" description="Time range shown on the weekly grid">
          <Select label="Day starts at" options={HOURS} value={s.dayStart} onChange={(v) => set('dayStart', v)} />
          <span className="text-[11px] text-neutral-500">to</span>
          <Select label="Day ends at" options={HOURS} value={s.dayEnd} onChange={(v) => set('dayEnd', v)} />
        </Row>,
        <Row key="tz" label="Time zone">
          <Select label="Time zone" options={TIME_ZONES} value={s.timeZone} onChange={(v) => set('timeZone', v)} />
        </Row>,
        <Row key="office" label="Show office hours on schedule">
          <Toggle label="Show office hours on schedule" checked={s.showOfficeHours} onChange={(v) => set('showOfficeHours', v)} />
        </Row>,
        <Row key="observing" label="Show sessions I am observing" description="Include colleagues’ classes you are observing alongside your own">
          <Toggle label="Show sessions I am observing" checked={s.showObserving} onChange={(v) => set('showObserving', v)} />
        </Row>,
      ],
    },
    {
      id: 'notifications',
      title: 'Notifications',
      description: 'Choose where you hear about requests, confirmations, and deadlines',
      content: [
        <Row key="request" label="New observer request" description="A colleague asks you to observe their class">
          <ChannelToggles label="New observer request" value={s.notifyObserverRequest} onChange={(v) => set('notifyObserverRequest', v)} />
        </Row>,
        <Row key="awaiting" label="Session awaiting your confirmation" description="An observer proposes a date to observe you">
          <ChannelToggles label="Session awaiting your confirmation" value={s.notifyAwaitingConfirmation} onChange={(v) => set('notifyAwaitingConfirmation', v)} />
        </Row>,
        <Row key="confirmed" label="Session confirmed or rescheduled">
          <ChannelToggles label="Session confirmed or rescheduled" value={s.notifyConfirmed} onChange={(v) => set('notifyConfirmed', v)} />
        </Row>,
        <Row key="deadline" label="Deadline reminders" description="Sign-up and observation deadlines for the current cycle">
          <Select label="Deadline reminder timing" options={DEADLINE_NOTICES} value={s.deadlineReminder} onChange={(v) => set('deadlineReminder', v)} />
          <ChannelToggles label="Deadline reminders" value={s.notifyDeadline} onChange={(v) => set('notifyDeadline', v)} />
        </Row>,
        <Row key="overdue" label="Overdue request or report" description="Something you owe is past its deadline">
          <ChannelToggles label="Overdue request or report" value={s.notifyOverdue} onChange={(v) => set('notifyOverdue', v)} />
        </Row>,
        <Row key="digest" label="Weekly digest" description="Summary of upcoming sessions and open requests">
          <Select label="Weekly digest" options={DIGEST_TIMES} value={s.weeklyDigest} onChange={(v) => set('weeklyDigest', v)} />
        </Row>,
      ],
    },
  ]

  return (
    <SettingsLayout
      title="Settings"
      subtitle="Your profile, schedule view, and notification preferences"
      sections={sections}
      dirty={dirty}
      onSave={save}
      onDiscard={discard}
      collapsible
      initiallyOpen={['profile']}
    />
  )
}

export default TeacherSettingsPage
