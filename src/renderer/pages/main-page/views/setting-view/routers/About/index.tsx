import A from "@/renderer/components/A";
import "./index.scss";
import { Trans, useTranslation } from "react-i18next";
import { getGlobalContext } from "@/shared/global-context/renderer";

export default function About() {
    const { t } = useTranslation();

    return (
        <div className="setting-view--about-container">
            <div className="setting-row about-version">
                <span>{t("settings.about.software_author")}</span>
                <A href="https://github.com/maotoumao">GitHub @maotoumao</A>
                <A href="https://github.com/thejidex">GitHub @thejidex</A>
                <A href="https://github.com/thejidex/MusicFreeDesktop">thejidex/MusicFreeDesktop</A>
            </div>
            <div className="setting-row about-version">
                <Trans
                    i18nKey={"settings.about.current_version"}
                    values={{
                        version: getGlobalContext().appVersion,
                    }}
                ></Trans>
            </div>
        </div>
    );
}
