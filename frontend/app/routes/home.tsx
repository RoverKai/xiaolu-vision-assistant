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
const defaultPrompt = "请按发言人和优先级，整理当前共享页面里的改动项";
const sharedPageHint =
  "这里用前端演示效果模拟“点击共享后展示当前浏览页面”，暂未接入真实系统抓屏。";

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
    text: "你可以通过下方输入方式接入共享页面、摄像头或麦克风；共享当前页面后，我会按前端演示效果读取页面结构与任务状态。",
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
    text: "可以，等你共享当前页面、开启摄像头，或者先把麦克风打开后，我会继续整理这轮优化项和结论。",
  },
];

const shareSectionOrder: ShareSection[] = ["optimization", "invite", "confirmed"];

export function meta(_: Route.MetaArgs) {
  return [
    { title: "小噜AI 视觉对话助手" },
    {
      name: "description",
      content:
        "复刻腾讯会议视觉助手原型，并提供共享当前页面、摄像头、麦克风和 AI 对话联动体验。",
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

function getEnabledInputs(
  shareOn: boolean,
  cameraOn: boolean,
  microphoneOn: boolean,
) {
  return [
    shareOn ? "共享页面" : null,
    cameraOn ? "摄像头" : null,
    microphoneOn ? "麦克风" : null,
  ].filter((value): value is string => Boolean(value));
}

function getBannerMessage(
  shareOn: boolean,
  cameraOn: boolean,
  microphoneOn: boolean,
) {
  if (shareOn && cameraOn && microphoneOn) {
    return "小噜AI 已启动，正在同时理解共享页面、摄像头画面和麦克风语音。";
  }

  if (shareOn && cameraOn) {
    return "小噜AI 已启动，正在同时理解共享页面和摄像头画面。";
  }

  if (shareOn && microphoneOn) {
    return "小噜AI 已启动，正在读取共享页面，并同步收听你的语音补充。";
  }

  if (shareOn) {
    return "小噜AI 已启动，当前正在读取你正在浏览的页面。";
  }

  if (cameraOn && microphoneOn) {
    return "小噜AI 已启动，正在读取摄像头画面，并同步收听你的语音补充。";
  }

  if (cameraOn) {
    return "小噜AI 已启动，当前正在读取摄像头画面。";
  }

  if (microphoneOn) {
    return "小噜AI 已启动，当前正在收听房间语音，等待视觉输入接入。";
  }

  return "小噜AI 已启动，请先选择一种输入方式。";
}

function getStagePlaceholderText(cameraOn: boolean, microphoneOn: boolean) {
  if (cameraOn && microphoneOn) {
    return "摄像头和麦克风已接入，继续共享当前页面后，我会把视觉内容一起纳入结论。";
  }

  if (cameraOn) {
    return "摄像头已开启，继续共享当前页面后，我会把画面和页面内容一起整理。";
  }

  if (microphoneOn) {
    return "麦克风已开启，你可以先口头描述页面重点，我会在共享接入后继续跟进。";
  }

  return "选择下方输入方式后，我会开始读取页面、画面或语音内容。";
}

function getReplyText(
  question: string,
  shareOn: boolean,
  cameraOn: boolean,
  microphoneOn: boolean,
  section: ShareSection,
  activeSpeaker: Participant,
) {
  if (!shareOn && !cameraOn && !microphoneOn) {
    return "请先接入一种输入方式，我再继续帮你整理。";
  }

  if (!shareOn && !cameraOn && microphoneOn) {
    return "我已经在收听语音了，如果你还需要我直接理解页面内容，再打开共享当前页面或摄像头就行。";
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

  if (question.includes("麦克风") || question.includes("语音")) {
    return microphoneOn
      ? "麦克风已经接入，我会把你的口头补充和房间发言一起纳入上下文。"
      : "如果你希望我同步收听你的补充，可以把麦克风也打开。";
  }

  if (question.includes("页面") || question.includes("窗口")) {
    if (shareOn) {
      return `当前共享的是你浏览器里的“${shareSections[section].chromeTitle}”，AI 已经把页面里的任务项和房间对话一起纳入上下文。`;
    }

    if (cameraOn) {
      return "当前还没有共享页面，我先根据摄像头和房间讨论继续理解现场，你也可以再打开共享当前页面。";
    }

    return "我已经在收听语音，如果你要我直接读取页面内容，再打开共享当前页面就行。";
  }

  if (shareOn && cameraOn && microphoneOn) {
    return "我已经把当前页面、房间画面和麦克风语音一起纳入上下文，可以继续按发言人、任务和结论三个维度整理。";
  }

  if (cameraOn && microphoneOn) {
    return "我已经关联到房间画面和麦克风语音，可以继续帮你按发言人、任务和结论三个维度整理。";
  }

  if (shareOn && cameraOn) {
    return "我已经关联到共享页面和房间画面，可以继续帮你按发言人、任务和结论三个维度整理。";
  }

  if (cameraOn) {
    return "我已经关联到房间画面，可以继续帮你按发言人、任务和结论三个维度整理；如果还要我一起看页面，再打开共享当前页面就行。";
  }

  if (microphoneOn) {
    return "我已经开始收听房间语音，你可以继续口头补充；如果还要我理解页面内容，再接入共享当前页面或摄像头。";
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
      <symbol id="icon-microphone" viewBox="0 0 24 24">
        <rect x="8.25" y="4.25" width="7.5" height="11" rx="3.75"></rect>
        <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0"></path>
        <path d="M12 17v3.5"></path>
        <path d="M9 20.5h6"></path>
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
      <symbol id="icon-chevron-down" viewBox="0 0 24 24">
        <path d="m7.5 10 4.5 4.5 4.5-4.5"></path>
      </symbol>
    </svg>
  );
}

export default function Home() {
  const [shareOn, setShareOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [microphoneOn, setMicrophoneOn] = useState(false);
  const [inputPanelOpen, setInputPanelOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activity, setActivity] = useState<Activity>("active");
  const [activeSpeakerId, setActiveSpeakerId] = useState<ParticipantId>("chenying");
  const [shareSection, setShareSection] = useState<ShareSection>("optimization");
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [clockLabel, setClockLabel] = useState(() => formatClock());
  const [currentPageUrl, setCurrentPageUrl] = useState("127.0.0.1:5173/#meeting");
  const [messages, setMessages] = useState<Message[]>(initialMessages);

  const responseTimerRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const nextMessageIdRef = useRef(initialMessages.length + 1);
  const conversationStreamRef = useRef<HTMLDivElement | null>(null);
  const inputPanelRef = useRef<HTMLDivElement | null>(null);

  const activeSpeaker = getParticipantById(activeSpeakerId);
  const sectionConfig = shareSections[shareSection];
  const enabledInputs = getEnabledInputs(shareOn, cameraOn, microphoneOn);
  const hasEnabledInputs = enabledInputs.length > 0;
  const statusText = activity === "thinking" ? "小噜AI 分析中" : "小噜AI 已启动";
  const stageMetaText = shareOn
    ? `当前浏览页面 · ${sectionConfig.chromeTitle}`
    : "未共享页面";
  const inputStatusText = hasEnabledInputs
    ? `输入方式：${enabledInputs.join(" / ")}`
    : "输入方式：未接入";
  const inputSummaryText = hasEnabledInputs
    ? enabledInputs.join(" · ")
    : "共享页面、摄像头、麦克风";

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

  const syncCurrentPageUrl = useEffectEvent(() => {
    if (typeof window === "undefined") {
      return;
    }

    const { host, pathname, hash } = window.location;
    setCurrentPageUrl(`${host}${pathname}${hash || "#meeting"}`);
  });

  const appendMessage = useEffectEvent((message: Message) => {
    startTransition(() => {
      setMessages((currentMessages) => [...currentMessages, message]);
    });
  });

  const handleToggleShare = useEffectEvent(() => {
    if (!shareOn) {
      setShareSection("optimization");
    }

    setShareOn((current) => !current);
  });

  const handleToggleCamera = useEffectEvent(() => {
    setCameraOn((current) => !current);
  });

  const handleToggleMicrophone = useEffectEvent(() => {
    setMicrophoneOn((current) => !current);
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
          microphoneOn,
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
    setMicrophoneOn(false);
    setInputPanelOpen(false);
    setInviteOpen(false);
    setCopied(false);
    setActivity("active");
    setActiveSpeakerId("chenying");
    setPrompt(defaultPrompt);
    appendMessage({
      id: nextMessageIdRef.current++,
      role: "system",
      meta: "AI 自动消息",
      text: "本次演示已结束，重新接入共享页面、摄像头或麦克风后，小噜AI 会继续进入分析状态。",
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
    syncCurrentPageUrl();
    window.addEventListener("hashchange", syncCurrentPageUrl);

    return () => {
      window.removeEventListener("hashchange", syncCurrentPageUrl);
    };
  }, [syncCurrentPageUrl]);

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
    if (!inputPanelOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (inputPanelRef.current?.contains(event.target as Node)) {
        return;
      }

      setInputPanelOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setInputPanelOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [inputPanelOpen]);

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
        data-microphone={microphoneOn ? "on" : "off"}
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
                <span className="meta-pill">{inputStatusText}</span>
                <button className="user-chip" type="button" aria-label="当前用户">
                  林
                </button>
              </div>
            </header>

            <div className="notice-bar">
              <span className="notice-bar__dot"></span>
              <span>{getBannerMessage(shareOn, cameraOn, microphoneOn)}</span>
            </div>

            <main className="content-area">
              <section className="stage-card">
                <div className="stage-card__glow" aria-hidden="true"></div>

                <div className="stage-card__top-bar">
                  <div className="stage-card__title-row">
                    <span className="stage-card__label">共享页面</span>
                    <span className="stage-card__divider" aria-hidden="true"></span>
                    <span className="stage-card__window-name">{stageMetaText}</span>
                  </div>
                  <div className="stage-speaking-pill">
                    正在讲话：{activeSpeaker.name}
                  </div>
                  <div className="stage-card__room-meta">
                    {microphoneOn ? (
                      <span className="room-live-badge room-live-badge--voice">
                        <Icon name="icon-microphone" className="icon room-live-badge__icon" />
                        麦克风同步中
                      </span>
                    ) : null}
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
                        <span>{getStagePlaceholderText(cameraOn, microphoneOn)}</span>
                        <div className="share-placeholder__chips" aria-label="当前输入状态">
                          <span
                            className={`share-placeholder__chip${cameraOn ? " share-placeholder__chip--active" : ""}`}
                          >
                            摄像头
                          </span>
                          <span
                            className={`share-placeholder__chip${microphoneOn ? " share-placeholder__chip--active" : ""}`}
                          >
                            麦克风
                          </span>
                          <span className="share-placeholder__chip share-placeholder__chip--hint">
                            共享后显示当前浏览页面
                          </span>
                        </div>
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
                      <span className="share-preview__tab share-preview__tab--active">
                        <Icon name="icon-screen" className="icon share-preview__tab-icon" />
                        当前浏览页面
                      </span>
                      <span className="share-preview__address" title={currentPageUrl}>
                        {currentPageUrl}
                      </span>
                      <span className="share-preview__chrome-badge">共享中</span>
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
                        <div className="share-browser-banner">
                          <div>
                            <p>浏览器当前标签页</p>
                            <h3>{sectionConfig.chromeTitle}</h3>
                          </div>
                          <div className="share-browser-banner__status">
                            {cameraOn ? (
                              <span className="share-browser-banner__chip">
                                摄像头已接入
                              </span>
                            ) : null}
                            {microphoneOn ? (
                              <span className="share-browser-banner__chip share-browser-banner__chip--voice">
                                麦克风同步中
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <p className="share-browser-note">{sharedPageHint}</p>

                        <div className="share-highlight-grid">
                          <article className="share-highlight-card">
                            <span className="share-highlight-card__eyebrow">
                              AI 已识别
                            </span>
                            <strong>当前页的任务区、状态标签和待确认项</strong>
                            <p>
                              共享当前页面后，小噜AI 会把页面结构和房间发言一起纳入上下文。
                            </p>
                          </article>

                          <article className="share-highlight-card">
                            <span className="share-highlight-card__eyebrow">
                              推荐提示词
                            </span>
                            <strong>{defaultPrompt}</strong>
                            <p>
                              这句会同时结合当前共享页面内容和发言人，整理出更适合会内同步的结论。
                            </p>
                          </article>
                        </div>

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
                            <div className="participant-card__status-stack" aria-label="你的输入状态">
                              {hasEnabledInputs ? (
                                <>
                                  {shareOn ? (
                                    <span className="participant-card__status-pill">
                                      <Icon name="icon-screen" />
                                    </span>
                                  ) : null}
                                  {cameraOn ? (
                                    <span className="participant-card__status-pill">
                                      <Icon name="icon-camera" />
                                    </span>
                                  ) : null}
                                  {microphoneOn ? (
                                    <span className="participant-card__status-pill participant-card__status-pill--live">
                                      <Icon name="icon-microphone" />
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                <span className="participant-card__status-pill participant-card__status-pill--idle">
                                  <Icon name="icon-screen" />
                                </span>
                              )}
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
                <div className="input-control" ref={inputPanelRef}>
                  <button
                    className={`control-button control-button--input${hasEnabledInputs ? " control-button--active" : ""}${inputPanelOpen ? " control-button--open" : ""}`}
                    type="button"
                    aria-expanded={inputPanelOpen}
                    aria-controls="input-panel"
                    onClick={() => setInputPanelOpen((current) => !current)}
                  >
                    <span className="control-button__icon">
                      <Icon name="icon-screen" />
                    </span>
                    <span className="control-button__content">
                      <span className="control-button__label">输入方式</span>
                      <span className="control-button__summary">{inputSummaryText}</span>
                    </span>
                    <span className="control-button__chevron" aria-hidden="true">
                      <Icon
                        name="icon-chevron-down"
                        className="icon control-button__chevron-icon"
                      />
                    </span>
                  </button>

                  <div
                    className={`input-popover${inputPanelOpen ? " input-popover--open" : ""}`}
                    id="input-panel"
                  >
                    <div className="input-popover__header">
                      <div>
                        <p className="input-popover__eyebrow">输入方式</p>
                        <h3>把当前可用的视觉与语音信号接进来</h3>
                      </div>
                      <span className="input-popover__count">
                        {hasEnabledInputs ? `${enabledInputs.length} 项已接入` : "尚未接入"}
                      </span>
                    </div>

                    <div className="input-popover__grid">
                      <button
                        className={`input-source${shareOn ? " input-source--active" : ""}`}
                        type="button"
                        aria-pressed={shareOn}
                        onClick={handleToggleShare}
                      >
                        <span className="input-source__icon">
                          <Icon name="icon-screen" />
                        </span>
                        <span className="input-source__body">
                          <strong>共享当前页面</strong>
                          <span>
                            {shareOn
                              ? `舞台区正在展示“${sectionConfig.chromeTitle}”的浏览器式快照，点击可停止共享。`
                              : "把你当前浏览的页面作为视觉输入接进来，舞台区会切成浏览器预览。"}
                          </span>
                        </span>
                        <span className="input-source__badge">
                          {shareOn ? "共享中" : "点击接入"}
                        </span>
                      </button>

                      <button
                        className={`input-source${cameraOn ? " input-source--active" : ""}`}
                        type="button"
                        aria-pressed={cameraOn}
                        onClick={handleToggleCamera}
                      >
                        <span className="input-source__icon">
                          <Icon name="icon-camera" />
                        </span>
                        <span className="input-source__body">
                          <strong>摄像头</strong>
                          <span>
                            {cameraOn
                              ? "已接入你的本地画面，AI 会继续理解在场状态，点击可关闭。"
                              : "补充读取你当前的现场画面，适合和共享页面一起使用。"}
                          </span>
                        </span>
                        <span className="input-source__badge">
                          {cameraOn ? "已接入" : "点击接入"}
                        </span>
                      </button>

                      <button
                        className={`input-source${microphoneOn ? " input-source--active" : ""}`}
                        type="button"
                        aria-pressed={microphoneOn}
                        onClick={handleToggleMicrophone}
                      >
                        <span className="input-source__icon">
                          <Icon name="icon-microphone" />
                        </span>
                        <span className="input-source__body">
                          <strong>麦克风</strong>
                          <span>
                            {microphoneOn
                              ? "正在同步你的口头补充，适合边看页面边讲重点，点击可关闭。"
                              : "同步收听你的口头补充，方便你一边操作页面一边给 AI 说明。"}
                          </span>
                        </span>
                        <span className="input-source__badge">
                          {microphoneOn ? "收音中" : "点击接入"}
                        </span>
                      </button>
                    </div>

                    <div className="input-popover__hint">
                      <span className="input-popover__hint-dot"></span>
                      {sharedPageHint}
                    </div>
                  </div>
                </div>

                <button
                  className="control-button"
                  type="button"
                  onClick={() => {
                    setInputPanelOpen(false);
                    setInviteOpen(true);
                  }}
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
