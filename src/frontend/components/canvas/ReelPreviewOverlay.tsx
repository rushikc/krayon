import {
  Camera,
  Clapperboard,
  Ellipsis,
  Heart,
  Home,
  MessageCircle,
  Plus,
  Search,
  Send,
  ShoppingBag,
  User,
} from "lucide-react";

const drop = "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]";
const icon = "size-[6.2cqw] stroke-[1.6]";

function Action({
  Icon,
  count,
}: {
  Icon: typeof Heart;
  count?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-[0.6cqh]">
      <Icon className={`${icon} ${drop}`} />
      {count ? (
        <span className={`text-[2.4cqw] font-semibold leading-none ${drop}`}>
          {count}
        </span>
      ) : null}
    </div>
  );
}

export function ReelPreviewOverlay() {
  return (
    <div
      data-testid="reel-preview-overlay"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[inherit] font-sans [container-type:size]"
    >
      <div className="absolute inset-0 bg-black/15" />
      <div className="absolute inset-x-0 bottom-0 h-[35%] bg-gradient-to-t from-black/45 via-black/10 to-transparent" />

      <div className="absolute top-[1.4%] left-[4%] text-[2.6cqw] font-medium tracking-tight text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]">
        12:20
      </div>
      <div className="absolute top-[0.6%] left-1/2 h-[3.1%] w-[28%] -translate-x-1/2 rounded-full bg-black" />
      <div className="absolute top-[1.6%] right-[4%] flex items-center gap-[1.2cqw]">
        <div className="h-[1.6cqw] w-[8cqw] rounded-[0.4cqw] bg-white/85" />
        <div className="h-[2.2cqw] w-[4.4cqw] rounded-[0.5cqw] border border-white/85" />
      </div>

      <div className="absolute top-[5.4%] right-[4%] left-[4%] flex items-center justify-between">
        <Plus className={`${icon} ${drop}`} />
        <div className="flex items-baseline gap-[3.2cqw]">
          <span className={`text-[4.4cqw] font-bold ${drop}`}>Reels</span>
          <span className={`text-[4.2cqw] font-semibold text-white/55 ${drop}`}>
            Friends
          </span>
        </div>
        <Camera className={`${icon} ${drop}`} />
      </div>

      <div className="absolute top-[46%] right-[3.2%] flex flex-col items-center gap-[2.4cqh]">
        <Action Icon={Heart} count="4.8M" />
        <Action Icon={MessageCircle} count="10.5K" />
        <Action Icon={Send} count="644K" />
        <Action Icon={Ellipsis} />
        <div className="mt-[0.4cqh] size-[8cqw] overflow-hidden rounded-[1.6cqw] border border-white/70 bg-white/25 shadow-[0_1px_4px_rgba(0,0,0,0.4)]" />
      </div>

      <div className="absolute right-[18%] bottom-[11%] left-[4%]">
        <div className="flex items-center gap-[2cqw]">
          <div className="size-[8.5cqw] shrink-0 rounded-full border-[0.5cqw] border-white/90 bg-white/30" />
          <span className={`truncate text-[3.4cqw] font-semibold ${drop}`}>
            username
          </span>
          <span
            className={`rounded-[0.8cqw] border border-white/80 px-[2cqw] py-[0.4cqh] text-[2.6cqw] font-semibold ${drop}`}
          >
            Follow
          </span>
        </div>
        <p className={`mt-[1cqh] truncate text-[3cqw] ${drop}`}>
          Caption of the reel goes here…
        </p>
        <p className={`mt-[0.6cqh] text-[2.4cqw] text-white/80 ${drop}`}>
          Liked by you and others
        </p>
      </div>

      <div className="absolute inset-x-[4%] bottom-[8.4%] h-[0.28%] rounded-full bg-white/55" />

      <div className="absolute inset-x-0 bottom-0 flex h-[7.6%] items-center justify-around bg-black/55 px-[2%]">
        <Home className={`${icon} ${drop}`} />
        <Search className={`${icon} ${drop}`} />
        <Clapperboard className={`${icon} ${drop}`} />
        <ShoppingBag className={`${icon} ${drop}`} />
        <User className={`${icon} ${drop}`} />
      </div>
      <div className="absolute bottom-[1.1%] left-1/2 h-[0.55%] w-[28%] -translate-x-1/2 rounded-full bg-white/80" />
    </div>
  );
}
