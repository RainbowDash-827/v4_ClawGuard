# 🦞🛡️ ClawGuard: Comprehensive Safety Protection for OpenClaw Agents Through Skills and Plugins
1.	Skill-based防御
1.	安装
Step1：在wsl下，执行如下命令
cd clawguard-skill/skills/windows-safety-guide/scripts
./install.sh
Step2: 将下面文字输入给openclaw
Please use the windows-safety-guide skill to enforce behavior security policies, configuration protection, and enable nightly security audits.
2.	Plugin-based 防御
1.	安装
Step1：安装
cd clawguard-plugin
bash install.sh
Step2：验证
npx openclaw clawguard audit
