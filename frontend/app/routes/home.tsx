import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import type { Route } from "./+types/home";

type Activity = "active" | "thinking";
type ShareSection = "optimization" | "invite" | "confirmed";
type ParticipantId = "lin" | "chenying" | "alex";
type ShareRowTone = "todo" | "warn" | "send" | "done";
type MessageRole = "system" | "participant" | "ai" | "user";

type Participant = {
  id: ParticipantId;
  name: string;
  shortName: string;
  role: string;
  tone?: "legal" | "product";
  isSelf?: boolean;
};

type ShareRow = {
  name: string;
  owner: string;
  due: string;
  status: string;
  tone: ShareRowTone;
  active?: boolean;
};

type ShareSectionConfig = {
  label: string;
  chromeTitle: string;
  chips: [string, string];
  rows: ShareRow[];
};

type Message = {
  id: number;
  role: MessageRole;
  meta: string;
  text: string;
  thinking?: boolean;
};

const inviteLink =
  "https://meeting.tencent.com/visual-assistant/room/8F2A-0917";

const participants: Participant[] = [
  { id: "lin", name: "林", shortName: "林", role: "你", isSelf: true },
  {
    id: "chenying",
    name: "陈颖",
    shortName: "陈",
    role: "设计",
    tone: "legal",
  },
  {
    id: "alex",
    name: "Alex",
    shortName: "A",
    role: "产品",
    tone: "product",
  },
];

const shareSections: Record<ShareSection, ShareSectionConfig> = {
  optimization: {
    label: "本轮优化",
    chromeTitle: "Web原型优化看板",
    chips: ["本轮待定 3 项", "待确认 1 项"],
    rows: [
      {
        name: "聊天区改宽与阅读优化",
        owner: "林",
        due: "18:30 前",
        status: "进行中",
        tone: "todo",
        active: true,
      },
      {
        name: "共享页内容改为原型优化看板",
        owner: "Alex",
        due: "19:00 前",
        status: "待调整",
        tone: "warn",
      },
      {
        name: "邀请好友弹窗文案确认",
        owner: "陈颖",
        due: "今日内",
        status: "待确认",
        tone: "send",
      },
    ],
  },
  invite: {
    label: "邀请协作",
    chromeTitle: "邀请协作清单",
    chips: ["邀请待办 2 项", "房间已在线 3 人"],
    rows: [
      {
        name: "邀请链接文案与分享语确认",
        owner: "陈颖",
        due: "今日内",
        status: "待确认",
        tone: "send",
        active: true,
      },
      {
        name: "加入房间后的身份归类说明",
        owner: "Alex",
        due: "18:50 前",
        status: "待调整",
        tone: "warn",
      },
      {
        name: "复制成功反馈与按钮状态",
        owner: "林",
        due: "已实现",
        status: "已同步",
        tone: "done",
      },
    ],
  },
  confirmed: {
    label: "已确认项",
    chromeTitle: "已确认事项",
    chips: ["已确认 2 项", "待复核 1 项"],
    rows: [
      {
        name: "AI 浮层保持贴合主舞台，不做侧边栏",
        owner: "陈颖",
        due: "已确认",
        status: "已同步",
        tone: "done",
        active: true,
      },
      {
        name: "共享窗口优先承载原型优化看板",
        owner: "Alex",
        due: "已确认",
        status: "已同步",
        tone: "done",
      },
      {
        name: "聊天区发送后给出分析中反馈",
        owner: "林",
        due: "待复核",
        status: "待确认",
        tone: "send",
      },
    ],
  },
};

const initialMessages: Message[] = [
  {
    id: 1,
    role: "system",
    meta: "AI 自动消息",
    text: "我已经接入你当前共享的原型优化看板，可以直接帮你读取页面任务、整理待办事项，并同步归纳多人讨论结论。",
  },
  {
    id: 2,
    role: "participant",
    meta: "11:39 · 陈颖（设计）",
    text: "先确认一下，聊天区改宽和共享页内容重做这两项，是不是这轮都要今天定掉？",
  },
  {
    id: 3,
    role: "ai",
    meta: "11:39 · AI",
    text: "当前共享页面显示 3 项任务，其中“聊天区改宽与阅读优化”为进行中，“共享页内容改为原型优化看板”为待调整，“邀请好友弹窗文案确认”为待确认。",
  },
  {
    id: 4,
    role: "user",
    meta: "11:41 · 你",
    text: "那你帮我把这轮要改的点整理一下，顺便按发言人把结论归纳给大家。",
  },
  {
    id: 5,
    role: "ai",
    meta: "11:41 · AI",
    text: "可以，等你共享窗口或开启摄像头后，我会继续整理这轮优化项和结论。",
  },
];

const shareSectionOrder: ShareSection[] = ["optimization", "invite", "confirmed"];

export function meta(_: Route.MetaArgs) {
  return [
    { title: "小噜AI 视觉对话助手" },
    {
      name: "description",
      content: "复刻腾讯会议视觉助手原型，并提供共享窗口、摄像头和 AI 对话联动体验。",
    },
  ];
}

function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getBannerMessage(shareOn: boolean, cameraOn: boolean) {
  if (shareOn && cameraOn) {
    return "小噜AI 已启动，正在同时理解共享窗口内容和摄像头画面。";
  }

  if (shareOn) {
    return "小噜AI 已启动，当前正在读取共享窗口内容。";
  }

  if (cameraOn) {
    return "小噜AI 已启动，当前正在读取摄像头画面。";
  }

  return "小噜AI 已启动，请先共享当前窗口或开启摄像头。";
}

function getReplyText(
  question: string,
  shareOn: boolean,
  cameraOn: boolean,
  section: ShareSection,
  activeSpeaker: Participant,
) {
  if (!shareOn && !cameraOn) {
    return "请先共享窗口或开启摄像头，我再继续帮你整理。";
  }

  if (question.includes("待办") || question.includes("总结")) {
    return `这轮建议先收口“${shareSections.optimization.rows[0].name}”和“${shareSections.optimization.rows[1].name}”，再确认邀请弹窗文案，方便今天内一起定稿。`;
  }

  if (question.includes("邀请") || question.includes("弹窗")) {
    return "邀请协作页当前重点是链接文案、身份归类说明和复制成功反馈，弹窗信息已经足够支持快速拉人进房。";
  }

  if (question.includes("谁") || question.includes("发言")) {
    return `当前主发言人是${activeSpeaker.name}，重点在${activeSpeaker.role === "设计" ? "界面表达是否贴近原型" : activeSpeaker.role === "产品" ? "任务优先级和确认节奏" : "当前这轮的实现与收口安排"}。`;
  }

  if (question.includes("页面") || question.includes("窗口")) {
    return `当前共享的是“${shareSections[section].chromeTitle}”，AI 已经把窗口里的任务项和房间对话一起纳入上下文。`;
  }

  if (cameraOn) {
    return "我已经关联到房间画面和共享内容，可以继续帮你按发言人、任务和结论三个维度整理。";
  }

  return "我已关联页面内容和房间发言，可以继续帮你提炼结论。";
}

function getParticipantById(id: ParticipantId) {
  return participants.find((participant) => participant.id === id) ?? participants[0];
}

function Icon({
  name,
  className = "icon",
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#${name}`}></use>
    </svg>
  );
}

function IconSprite() {
  return (
    <svg className="icon-sprite" aria-hidden="true">
      <symbol id="icon-camera" viewBox="0 0 24 24">
        <rect x="3.5" y="7" width="13" height="10" rx="2"></rect>
        <path d="M16.5 10.5 20.5 8v8l-4-2.5"></path>
      </symbol>
      <symbol id="icon-screen" viewBox="0 0 24 24">
        <rect x="3.5" y="4.5" width="17" height="11.5" rx="2"></rect>
        <path d="M8.5 19.5h7"></path>
        <path d="M12 16v3.5"></path>
      </symbol>
      <symbol id="icon-user-plus" viewBox="0 0 24 24">
        <circle cx="9" cy="8" r="3"></circle>
        <path d="M4.5 17a5.5 5.5 0 0 1 9 0"></path>
        <path d="M17 8.5v6"></path>
        <path d="M14 11.5h6"></path>
      </symbol>
      <symbol id="icon-clock" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5"></circle>
        <path d="M12 7.5V12l3 2"></path>
      </symbol>
      <symbol id="icon-phone-off" viewBox="0 0 24 24">
        <path d="M5.5 7.5a15 15 0 0 1 13 0"></path>
        <path d="M7.5 8.4V14a1.5 1.5 0 0 0 1.5 1.5H10"></path>
        <path d="M16.5 8.4V14A1.5 1.5 0 0 1 15 15.5h-1"></path>
        <path d="m5 19 14-14"></path>
      </symbol>
      <symbol id="icon-send" viewBox="0 0 24 24">
        <path d="m21 3-9.5 18-1.9-7.6L3 11.5z"></path>
        <path d="M9.6 13.4 21 3"></path>
      </symbol>
      <symbol id="icon-close" viewBox="0 0 24 24">
        <path d="m7 7 10 10"></path>
        <path d="M17 7 7 17"></path>
      </symbol>
      <symbol id="icon-copy" viewBox="0 0 24 24">
        <rect x="8" y="7" width="10" height="12" rx="2"></rect>
        <path d="M6.5 15H6A2.5 2.5 0 0 1 3.5 12.5V6A2.5 2.5 0 0 1 6 3.5h6.5A2.5 2.5 0 0 1 15 6v.5"></path>
      </symbol>
      <symbol id="icon-check" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5"></circle>
        <path d="m8.8 12.2 2.2 2.3 4.2-4.7"></path>
      </symbol>
    </svg>
  );
}

export default function Home() {
  const [shareOn, setShareOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activity, setActivity] = useState<Activity>("active");
  const [activeSpeakerId, setActiveSpeakerId] = useState<ParticipantId>("chenying");
  const [shareSection, setShareSection] = useState<ShareSection>("optimization");
  const [prompt, setPrompt] = useState("帮我总结本轮优化结论");
  const [clockLabel, setClockLabel] = useState(() => formatClock());
  const [messages, setMessages] = useState<Message[]>(initialMessages);

  const responseTimerRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const nextMessageIdRef = useRef(initialMessages.length + 1);
  const conversationStreamRef = useRef<HTMLDivElement | null>(null);

  const activeSpeaker = getParticipantById(activeSpeakerId);
  const sectionConfig = shareSections[shareSection];
  const statusText = activity === "thinking" ? "小噜AI 分析中" : "小噜AI 已启动";
  const stageMetaText = shareOn ? sectionConfig.chromeTitle : "未共享窗口";
  const shareStatusText = shareOn ? "共享窗口：已接入" : "共享窗口：未接入";

  const clearPendingResponse = useEffectEvent(() => {
    if (responseTimerRef.current) {
      window.clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
    }

    startTransition(() => {
      setMessages((currentMessages) =>
        currentMessages.filter((message) => !message.thinking),
      );
    });
  });

  const syncClock = useEffectEvent(() => {
    setClockLabel(formatClock());
  });

  const syncInviteFromHash = useEffectEvent(() => {
    if (typeof window === "undefined") {
      return;
    }

    setInviteOpen(window.location.hash === "#invite");
  });

  const appendMessage = useEffectEvent((message: Message) => {
    startTransition(() => {
      setMessages((currentMessages) => [...currentMessages, message]);
    });
  });

  const handleAskAI = useEffectEvent((question: string) => {
    const cleanQuestion = question.trim();
    if (!cleanQuestion) {
      return;
    }

    clearPendingResponse();

    const userMessage: Message = {
      id: nextMessageIdRef.current++,
      role: "user",
      meta: `${formatClock()} · 你`,
      text: cleanQuestion,
    };
    const thinkingMessage: Message = {
      id: nextMessageIdRef.current++,
      role: "ai",
      meta: "正在思考…",
      text: "正在结合共享页面和房间发言分析…",
      thinking: true,
    };

    startTransition(() => {
      setMessages((currentMessages) => [
        ...currentMessages,
        userMessage,
        thinkingMessage,
      ]);
    });
    setActivity("thinking");
    setPrompt("");

    responseTimerRef.current = window.setTimeout(() => {
      const replyMessage: Message = {
        id: nextMessageIdRef.current++,
        role: "ai",
        meta: `${formatClock()} · AI`,
        text: getReplyText(
          cleanQuestion,
          shareOn,
          cameraOn,
          shareSection,
          activeSpeaker,
        ),
      };

      startTransition(() => {
        setMessages((currentMessages) =>
          currentMessages
            .filter((message) => message.id !== thinkingMessage.id)
            .concat(replyMessage),
        );
      });
      setActivity("active");
      responseTimerRef.current = null;
    }, 1100);
  });

  const handleCopyInvite = useEffectEvent(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteLink);
      }
    } catch {
      // Ignore clipboard failures for prototype mode.
    }

    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current);
    }

    setCopied(true);
    copyTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = null;
    }, 1400);
  });

  const handleEndConversation = useEffectEvent(() => {
    clearPendingResponse();
    setShareOn(false);
    setCameraOn(false);
    setInviteOpen(false);
    setCopied(false);
    setActivity("active");
    setActiveSpeakerId("chenying");
    setPrompt("帮我总结本轮优化结论");
    appendMessage({
      id: nextMessageIdRef.current++,
      role: "system",
      meta: "AI 自动消息",
      text: "本次演示已结束，重新开启共享窗口或摄像头后，小噜AI 会继续进入分析状态。",
    });
  });

  useEffect(() => {
    syncClock();
    const timer = window.setInterval(syncClock, 15000);

    return () => {
      window.clearInterval(timer);
    };
  }, [syncClock]);

  useEffect(() => {
    syncInviteFromHash();
    window.addEventListener("hashchange", syncInviteFromHash);

    return () => {
      window.removeEventListener("hashchange", syncInviteFromHash);
    };
  }, [syncInviteFromHash]);

  useEffect(() => {
    const nextHash = inviteOpen ? "#invite" : "#meeting";
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
  }, [inviteOpen]);

  useEffect(() => {
    conversationStreamRef.current?.lastElementChild?.scrollIntoView({
      block: "nearest",
    });
  }, [messages]);

  useEffect(() => {
    return () => {
      clearPendingResponse();

      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, [clearPendingResponse]);

  return (
    <>
      <IconSprite />

      <div
        className="prototype-shell"
        data-share={shareOn ? "on" : "off"}
        data-camera={cameraOn ? "on" : "off"}
        data-invite={inviteOpen ? "open" : "closed"}
        data-copy={copied ? "done" : "idle"}
        data-activity={activity}
      >
        <div className="app-surface">
          <div className="meeting-shell">
            <header className="topbar">
              <div className="topbar__left">
                <div className="logo">
                  <span className="logo__mark" aria-hidden="true"></span>
                  <span>小噜AI 视觉对话助手</span>
                </div>
                <span className="room-pill">3 人在线</span>
              </div>

              <div className="topbar__center">
                <div className="clock-pill">
                  <Icon name="icon-clock" />
                  <span>{clockLabel}</span>
                </div>
                <span className="status-pill">{statusText}</span>
              </div>

              <div className="topbar__right">
                <span className="meta-pill">{shareStatusText}</span>
                <button className="user-chip" type="button" aria-label="当前用户">
                  林
                </button>
              </div>
            </header>

            <div className="notice-bar">
              <span className="notice-bar__dot"></span>
              <span>{getBannerMessage(shareOn, cameraOn)}</span>
            </div>

            <main className="content-area">
              <section className="stage-card">
                <div className="stage-card__glow" aria-hidden="true"></div>

                <div className="stage-card__top-bar">
                  <div className="stage-card__title-row">
                    <span className="stage-card__label">共享窗口</span>
                    <span className="stage-card__divider" aria-hidden="true"></span>
                    <span className="stage-card__window-name">{stageMetaText}</span>
                  </div>
                  <div className="stage-speaking-pill">
                    正在讲话：{activeSpeaker.name}
                  </div>
                  <div className="stage-card__room-meta">
                    <span className="room-live-badge">
                      <span className="room-live-dot"></span>
                      房间进行中
                    </span>
                  </div>
                </div>

                <div className="stage-canvas">
                  <div className="share-placeholder">
                    <div className="share-placeholder__inner share-placeholder__inner--meeting">
                      <div className="share-placeholder__presence">
                        <div
                          className={`share-placeholder__avatar${activeSpeaker.tone ? ` share-placeholder__avatar--${activeSpeaker.tone}` : ""}`}
                        >
                          {activeSpeaker.shortName}
                        </div>
                        <strong>{activeSpeaker.name}</strong>
                        <span>{activeSpeaker.role}正在发言，可继续语音对话</span>
                      </div>
                    </div>
                  </div>

                  <div className="share-preview">
                    <div className="share-preview__chrome">
                      <span className="share-preview__chrome-dots">
                        <i></i>
                        <i></i>
                        <i></i>
                      </span>
                      <span className="share-preview__chrome-title">
                        {sectionConfig.chromeTitle}
                      </span>
                      <span className="share-preview__chrome-badge">AI 已接入</span>
                    </div>

                    <div className="share-preview__body">
                      <aside className="share-sidebar">
                        <div className="share-sidebar__brand">
                          <span className="share-sidebar__logo"></span>
                          <span className="share-sidebar__logo-text">项目台</span>
                        </div>
                        <nav className="share-sidebar__nav" aria-label="共享内容分类">
                          {shareSectionOrder.map((section) => (
                            <button
                              key={section}
                              className={`share-sidebar__item${shareSection === section ? " share-sidebar__item--active" : ""}`}
                              type="button"
                              onClick={() => setShareSection(section)}
                            >
                              <span className="share-sidebar__dot"></span>
                              {shareSections[section].label}
                            </button>
                          ))}
                        </nav>
                      </aside>

                      <section className="share-main">
                        <div className="share-toolbar">
                          <span className="share-toolbar__chip">
                            <span className="share-toolbar__indicator share-toolbar__indicator--pending"></span>
                            {sectionConfig.chips[0]}
                          </span>
                          <span className="share-toolbar__chip">
                            <span className="share-toolbar__indicator share-toolbar__indicator--review"></span>
                            {sectionConfig.chips[1]}
                          </span>
                        </div>

                        <div className="share-table">
                          <div className="share-row share-row--header">
                            <span>事项</span>
                            <span>负责人</span>
                            <span>时间</span>
                            <span>状态</span>
                          </div>
                          {sectionConfig.rows.map((row) => (
                            <div
                              key={`${shareSection}-${row.name}`}
                              className={`share-row${row.active ? " share-row--active" : ""}`}
                            >
                              <span className="share-row__name">{row.name}</span>
                              <span>{row.owner}</span>
                              <span>{row.due}</span>
                              <span
                                className={`share-row__badge share-row__badge--${row.tone}`}
                              >
                                {row.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </div>

                  <div className="stage-message-scrollbar" aria-hidden="true">
                    <span className="stage-message-scrollbar__thumb"></span>
                  </div>

                  <div className="participant-strip" aria-label="房间成员">
                    {participants.map((participant) => {
                      const isSpeaking = participant.id === activeSpeakerId;
                      const avatarToneClass = participant.tone
                        ? ` participant-card__avatar--${participant.tone}`
                        : "";
                      return (
                        <button
                          key={participant.id}
                          className={`participant-card${isSpeaking ? " participant-card--speaking" : ""}${participant.isSelf ? " participant-card--self" : ""}`}
                          type="button"
                          onClick={() => setActiveSpeakerId(participant.id)}
                        >
                          <div
                            className={`participant-card__avatar${avatarToneClass}`}
                          >
                            {participant.shortName}
                          </div>
                          <div className="participant-card__meta">
                            <strong>{participant.name}</strong>
                            <span>{participant.role}</span>
                          </div>
                          {isSpeaking ? (
                            <div className="participant-card__speaking-wave">
                              <i></i>
                              <i></i>
                              <i></i>
                            </div>
                          ) : participant.isSelf ? (
                            <div className="participant-card__mic">
                              <Icon name="icon-screen" />
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  <div className="camera-tile">
                    <div className="camera-tile__header">
                      <span>
                        <span className="camera-tile__live-dot"></span>
                        我的摄像头
                      </span>
                      <span>已开启</span>
                    </div>
                    <div className="camera-tile__body">
                      <div className="camera-face">
                        <span className="camera-face__label">林</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <aside className="assistant-card">
                <div className="assistant-card__bg" aria-hidden="true"></div>

                <div className="assistant-card__header">
                  <div className="assistant-avatar">
                    AI
                    <span className="assistant-avatar__ring"></span>
                  </div>
                  <div className="assistant-card__header-text">
                    <h2>小噜AI</h2>
                    <p>已接入当前房间，正在同步分析共享页面与多人讨论内容</p>
                  </div>
                </div>

                <div className="room-summary">
                  <div className="room-summary__item">
                    <Icon name="icon-user-plus" />
                    <span>林、陈颖、Alex 在房间</span>
                  </div>
                  <div className="room-summary__item room-summary__item--active">
                    <span className="room-summary__speaking-dot"></span>
                    <span>{activeSpeaker.name} 正在发言</span>
                  </div>
                </div>

                <div
                  className="conversation-stream"
                  ref={conversationStreamRef}
                  aria-live="polite"
                >
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className={`bubble bubble--${message.role}${message.thinking ? " bubble--thinking" : ""}`}
                    >
                      {message.role === "user" ? (
                        <div className="bubble__meta">{message.meta}</div>
                      ) : (
                        <div className="bubble__avatar-row">
                          <div
                            className={`bubble__mini-avatar ${message.role === "participant" ? "bubble__mini-avatar--legal" : "bubble__mini-avatar--ai"}`}
                          >
                            {message.role === "participant" ? "陈" : "AI"}
                          </div>
                          <span className="bubble__meta">{message.meta}</span>
                        </div>
                      )}
                      <p>{message.text}</p>
                    </article>
                  ))}
                </div>

                <div className="assistant-input">
                  <div className="assistant-input__field">
                    <input
                      type="text"
                      value={prompt}
                      placeholder="输入要让小噜AI整理的问题"
                      onChange={(event) => setPrompt(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          handleAskAI(prompt);
                        }
                      }}
                    />
                    <div className="assistant-input__actions">
                      <button
                        className="send-button"
                        type="button"
                        onClick={() => handleAskAI(prompt)}
                        disabled={!prompt.trim()}
                        aria-label="发送给小噜AI"
                      >
                        <Icon name="icon-send" />
                      </button>
                    </div>
                  </div>
                </div>
              </aside>
            </main>

            <footer className="toolbar">
              <div className="toolbar__group">
                <button
                  className={`control-button${shareOn ? " control-button--active" : ""}`}
                  type="button"
                  aria-pressed={shareOn}
                  onClick={() => setShareOn((current) => !current)}
                >
                  <span className="control-button__icon">
                    <Icon name="icon-screen" />
                  </span>
                  <span className="control-button__label">
                    {shareOn ? "停止共享" : "共享当前窗口"}
                  </span>
                </button>

                <button
                  className={`control-button${cameraOn ? " control-button--active" : ""}`}
                  type="button"
                  aria-pressed={cameraOn}
                  onClick={() => setCameraOn((current) => !current)}
                >
                  <span className="control-button__icon">
                    <Icon name="icon-camera" />
                  </span>
                  <span className="control-button__label">
                    {cameraOn ? "关闭摄像头" : "开启摄像头"}
                  </span>
                </button>

                <button
                  className="control-button"
                  type="button"
                  onClick={() => setInviteOpen(true)}
                >
                  <span className="control-button__icon">
                    <Icon name="icon-user-plus" />
                  </span>
                  <span className="control-button__label">邀请好友</span>
                </button>
              </div>

              <div className="toolbar__group toolbar__group--right">
                <button className="end-button" type="button" onClick={handleEndConversation}>
                  <Icon name="icon-phone-off" />
                  <span>结束对话</span>
                </button>
              </div>
            </footer>
          </div>

          <div className="modal-layer modal-layer--invite">
            <div className="modal-card invite-modal">
              <div className="modal-card__header">
                <div>
                  <p className="modal-eyebrow">多人房间入口</p>
                  <h2>邀请好友加入当前房间</h2>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setInviteOpen(false)}
                  aria-label="关闭邀请弹窗"
                >
                  <Icon name="icon-close" />
                </button>
              </div>

              <div className="invite-grid">
                <section className="invite-block">
                  <div className="invite-block__title">
                    <h3>邀请链接</h3>
                    <p>
                      发送给好友后，对方加入房间，AI 会自动把发言人与共享内容一起纳入上下文。
                    </p>
                  </div>
                  <div className="invite-link">
                    <span>{inviteLink}</span>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={handleCopyInvite}
                    >
                      <Icon
                        name="icon-copy"
                        className="icon invite-copy-icon invite-copy-icon--copy"
                      />
                      <Icon
                        name="icon-check"
                        className="icon invite-copy-icon invite-copy-icon--check"
                      />
                      <span>{copied ? "已复制链接" : "复制链接"}</span>
                    </button>
                  </div>
                </section>

                <section className="invite-block">
                  <div className="invite-block__title">
                    <h3>当前房间成员</h3>
                    <p>加入房间后，AI 会按成员身份归纳发言。</p>
                  </div>
                  <div className="member-list">
                    {participants.map((participant) => {
                      const avatarToneClass = participant.tone
                        ? ` member-row__avatar--${participant.tone}`
                        : "";
                      return (
                        <article key={participant.id} className="member-row">
                          <div className={`member-row__avatar${avatarToneClass}`}>
                            {participant.shortName}
                          </div>
                          <div className="member-row__meta">
                            <strong>{participant.name}</strong>
                            <span>{participant.role} · 已在线</span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
