import type { LoaderFunctionArgs } from '@remix-run/node'
import { json, redirect } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { DateTime } from 'luxon'
import { Fragment } from 'react'
import { $path } from 'remix-routes'
import { Box, Flex, styled } from 'styled-system/jsx'
import { TypeOf } from 'zod'
import { AppLink } from '~/components/app-link'
import { SponsorSection } from '~/components/page-components/SponsorSection'
import { ConferenceConfigYear, ConferenceImportantInformation, ConferenceYear, Year } from '~/lib/config-types'
import { localeTimeFormat } from '~/lib/dates/formatting'
import { conferenceConfig } from '../config/conference-config'
import { formatDate, getScheduleGrid, gridSmartSchema } from '../lib/sessionize.server'
import { slugify } from '../lib/slugify'

export async function loader({ params, context }: LoaderFunctionArgs) {
    if (params.year && !/\d{4}/.test(params.year)) {
        throw redirect($path('/agenda/:year?', { year: undefined }))
    }

    const year =
        params.year && /\d{4}/.test(params.year) ? (params.year as Year) : context.conferenceState.conference.year

    const yearConfigLookup = (conferenceConfig.conferences as Record<Year, ConferenceConfigYear | undefined>)[year]
    if (!yearConfigLookup || 'cancelledMessage' in yearConfigLookup) {
        if (!params.year) {
            throw new Response(JSON.stringify({ message: 'No config for year' }), { status: 404 })
        }

        throw redirect($path('/agenda/:year?', { year: undefined }))
    }

    const yearConfig: ConferenceImportantInformation = params.year
        ? getImportantInformation(yearConfigLookup)
        : context.conferenceState.conference

    if (yearConfig.sessions?.kind === 'sessionize' && !yearConfig.sessions.sessionizeEndpoint) {
        throw new Response(JSON.stringify({ message: 'No sessionize endpoint for year' }), { status: 404 })
    }

    const schedules: TypeOf<typeof gridSmartSchema> =
        yearConfig.sessions?.kind === 'sessionize'
            ? await getScheduleGrid({
                  sessionizeEndpoint: yearConfig.sessions.sessionizeEndpoint,
                  confTimeZone: conferenceConfig.timezone,
              })
            : // TODO Deal with data type
              []

    const schedule = schedules[0]

    return json(
        {
            year,
            sponsors: yearConfigLookup.sponsors,
            conferences: Object.values(conferenceConfig.conferences).map((conf) => ({
                year: conf.year,
            })),
            schedule: schedule
                ? {
                      ...schedule,
                      dateSlug: slugify(
                          formatDate(schedule.date, {
                              month: 'short',
                              day: 'numeric',
                          }),
                      ),
                      dateISO: schedule.date,
                      dateFormatted: formatDate(schedule.date, {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                      }),
                      dateFormattedShort: formatDate(schedule.date, {
                          month: 'short',
                          day: 'numeric',
                      }),
                  }
                : undefined,
        },
        // { headers: { 'Cache-Control': CACHE_CONTROL.conf } },
    )
}

export default function Agenda() {
    const { schedule, sponsors, conferences, year } = useLoaderData<typeof loader>()
    const availableTimeSlots = schedule?.timeSlots.map((timeSlot) => timeSlot.slotStart.replace(/:/g, ''))

    if (!schedule) {
        return (
            <Box color="white" textAlign="center" fontSize="3xl" mt="10">
                <p>
                    {conferenceConfig.name} {year} agenda has not been announced
                </p>

                <SponsorSection year={year} sponsors={sponsors} />

                <ConferenceBrowser conferences={conferences} />
            </Box>
        )
    }

    return (
        <Flex
            flexDirection="column"
            alignContent="center"
            bgGradient="to-b"
            gradientFrom="#070727"
            gradientToPosition="99%"
            gradientTo="#0E0E43"
            mx="auto"
            p="4"
        >
            <Box
                maxWidth="1200px"
                color="#C2C2FF"
                mx="auto"
                p={1}
                fontSize="sm"
                style={
                    {
                        /**
                     * Note 1:
                     * Use 24hr time for gridline names for simplicity
                     *
                     * Note 2: Use "auto" instead of "1fr" for a more compact schedule where height of a slot is not proportional to the session length. Implementing a "compact" shortcode attribute might make sense for this!
                     *
                     Try 0.5fr for more compact equal rows. I don't quite understand how that works :)
                    */
                        '--slot-rows': [
                            '[rooms] auto',
                            ...schedule.timeSlots.map(
                                (timeSlot) => `[time-${timeSlot.slotStart.replace(/:/g, '')}] auto`,
                            ),
                        ].join(' '),
                        '--room-columns': [
                            '[times] auto',
                            ...schedule.rooms.map((room, index, rooms) =>
                                index === 0
                                    ? `[room-${room.id}-start] 1fr`
                                    : index + 1 === rooms.length
                                      ? `[room-${rooms[index - 1].id}-end room-${room.id}-start] 1fr [room-${room.id}-end]`
                                      : `[room-${rooms[index - 1].id}-end room-${room.id}-start] 1fr`,
                            ),
                        ].join(' '),
                    } as React.CSSProperties
                }
                xl={{
                    display: 'grid',
                    gridTemplateRows: 'var(--slot-rows)',
                    gridTemplateColumns: 'var(--room-columns)',
                    gridGap: '1',
                }}
            >
                {schedule.rooms.map((room) => (
                    /* hidden on small screens and browsers without grid support */
                    <Flex
                        key={room.id}
                        style={{ '--room-column': `room-${room.id}` } as React.CSSProperties}
                        aria-hidden="true"
                        justifyContent="center"
                        alignItems="center"
                        textAlign="center"
                        gridColumn="var(--room-column)"
                        gridRow="rooms"
                        display="none"
                        rounded="sm"
                        bgColor="#8D8DFF"
                        color="#070727"
                        fontWeight="semibold"
                        fontSize="sm"
                        padding={2}
                        xl={{
                            display: 'block',
                            position: 'sticky',
                            top: 4,
                            zIndex: 1000,
                        }}
                    >
                        {room.name}
                    </Flex>
                ))}

                {schedule.timeSlots.map((timeSlot, timeSlotIndex) => {
                    const startTime12 = DateTime.fromISO(timeSlot.slotStart).toFormat('h:mm a').toLowerCase()
                    const timeSlotSimple = timeSlot.slotStart.replace(/:/g, '')
                    const nextTimeSlot = schedule.timeSlots[timeSlotIndex + 1]
                    const nextTimeSlotStart = nextTimeSlot?.slotStart.replace(/:/g, '')

                    return (
                        <Fragment key={timeSlot.slotStart}>
                            <styled.h2
                                gridColumn="times"
                                style={{ gridRow: `time-${timeSlotSimple}` }}
                                mt="2"
                                xl={{ mt: 0 }}
                            >
                                {startTime12}
                                {nextTimeSlot?.slotStart ? (
                                    <styled.span display={{}} xl={{ display: 'none' }}>
                                        {' '}
                                        - {DateTime.fromISO(nextTimeSlot.slotStart).toFormat('h:mm a').toLowerCase()}
                                    </styled.span>
                                ) : null}
                            </styled.h2>

                            {timeSlot.rooms.map((room) => {
                                const fullSession = schedule.rooms
                                    .find((r) => r.id === room.id)
                                    ?.sessions.find((session) => session.id === room.session.id)
                                const endsAtTime = fullSession?.endsAt.replace(/\d{4}-\d{2}-\d{2}T/, '')
                                const endTime12 = fullSession?.endsAt
                                    ? DateTime.fromISO(fullSession.endsAt).toFormat('h:mm a').toLowerCase()
                                    : undefined

                                const timeSlotEnd = endsAtTime?.replace(/:/g, '') ?? ''
                                const earliestEnd = !availableTimeSlots?.includes(timeSlotEnd)
                                    ? nextTimeSlotStart
                                    : (timeSlotEnd ?? nextTimeSlotStart)

                                return (
                                    <styled.div
                                        key={room.id}
                                        marginBottom="0"
                                        xl={{ marginBottom: 1 }}
                                        style={{
                                            gridRow: `time-${timeSlotSimple} / time-${earliestEnd}`,
                                            gridColumn:
                                                timeSlot.rooms.length === 1
                                                    ? `room-${schedule.rooms.at(0)?.id} / room-${schedule.rooms.at(-1)?.id}`
                                                    : `room-${room.id}`,
                                        }}
                                    >
                                        <Box
                                            rounded="sm"
                                            bgColor="#1F1F4E"
                                            fontSize="sm"
                                            height="full"
                                            padding={2}
                                            mt="2"
                                            xl={{
                                                mt: 0,
                                            }}
                                        >
                                            <styled.h3
                                                wordWrap="break-word"
                                                color="white"
                                                fontSize="md"
                                                fontWeight="semibold"
                                                lineHeight="tight"
                                                mb={2}
                                            >
                                                <AppLink
                                                    to={$path('/agenda/:year/talk/:sessionId', {
                                                        year,
                                                        sessionId: fullSession?.id ?? '#',
                                                    })}
                                                >
                                                    {fullSession?.title}
                                                </AppLink>
                                            </styled.h3>
                                            <styled.span
                                                display="none"
                                                xl={{
                                                    display: 'flex',
                                                }}
                                                alignItems="center"
                                                gap={2}
                                                color="#C2C2FF"
                                                textWrap="nowrap"
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 16 16"
                                                    fill="currentColor"
                                                    style={{ width: '16px', height: '16px' }}
                                                >
                                                    <path
                                                        fillRule="evenodd"
                                                        d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 0 0 0-1.5h-2.5v-3.5Z"
                                                        clipRule="evenodd"
                                                    />
                                                </svg>
                                                {startTime12} - {endTime12}
                                            </styled.span>
                                            <Flex
                                                alignItems="center"
                                                gap={2}
                                                color="#C2C2FF"
                                                textOverflow="ellipsis"
                                                textWrap="nowrap"
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 16 16"
                                                    fill="currentColor"
                                                    style={{ width: '16px', height: '16px' }}
                                                >
                                                    <path
                                                        fillRule="evenodd"
                                                        d="m7.539 14.841.003.003.002.002a.755.755 0 0 0 .912 0l.002-.002.003-.003.012-.009a5.57 5.57 0 0 0 .19-.153 15.588 15.588 0 0 0 2.046-2.082c1.101-1.362 2.291-3.342 2.291-5.597A5 5 0 0 0 3 7c0 2.255 1.19 4.235 2.292 5.597a15.591 15.591 0 0 0 2.046 2.082 8.916 8.916 0 0 0 .189.153l.012.01ZM8 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
                                                        clipRule="evenodd"
                                                    />
                                                </svg>
                                                {room.name}
                                            </Flex>
                                            {fullSession?.speakers?.length ? (
                                                <Flex alignItems="center" gap={2} color="#C2C2FF">
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        viewBox="0 0 16 16"
                                                        fill="currentColor"
                                                        style={{ width: '16px', height: '16px' }}
                                                    >
                                                        <path
                                                            fillRule="evenodd"
                                                            d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0Zm-5-2a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM8 9c-1.825 0-3.422.977-4.295 2.437A5.49 5.49 0 0 0 8 13.5a5.49 5.49 0 0 0 4.294-2.063A4.997 4.997 0 0 0 8 9Z"
                                                            clipRule="evenodd"
                                                        />
                                                    </svg>
                                                    {fullSession?.speakers.map((speaker) => speaker.name)?.join(', ')}
                                                </Flex>
                                            ) : null}
                                        </Box>
                                    </styled.div>
                                )
                            })}
                        </Fragment>
                    )
                })}
            </Box>

            <SponsorSection sponsors={sponsors} year={year} />

            <ConferenceBrowser conferences={conferences} />
        </Flex>
    )
}

function ConferenceBrowser({ conferences }: { conferences: { year: Year }[] }) {
    return (
        <styled.div padding="4" color="white">
            <styled.h2 fontSize="xl" marginBottom="2" id="previous-years">
                View Previous Conferences
            </styled.h2>
            <styled.div display="flex" flexWrap="wrap" gap={4}>
                {conferences.map((conf) => (
                    <styled.a key={conf.year} href={`/agenda/${conf.year}`} color="#8282FB">
                        <styled.span fontSize="lg">{conf.year}</styled.span>
                    </styled.a>
                ))}
            </styled.div>
        </styled.div>
    )
}

function getImportantInformation(yearConfig: ConferenceYear): ConferenceImportantInformation {
    return {
        date: yearConfig.conferenceDate?.toISO(),
        year: yearConfig.year,
        sessions: yearConfig.sessions,
        ticketPrice: yearConfig.ticketPrice,
        votingOpens: yearConfig.talkVotingDates?.opens.toLocaleString(localeTimeFormat),
    }
}
