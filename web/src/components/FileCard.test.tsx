import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FileCard from "./FileCard";

jest.mock("./Thumbnail", () => {
	function MockThumbnail({ alt }: { alt?: string }) {
		return <div aria-label={alt} />;
	}
	MockThumbnail.displayName = "MockThumbnail";
	return MockThumbnail;
});

describe("FileCard", () => {
	it("selects a file without opening its preview", async () => {
		const user = userEvent.setup();
		const onSelect = jest.fn();
		const onPreview = jest.fn();
		const file = {
			path: "data/default/2026-08-01/video.mp4",
			name: "video.mp4",
			size: 1024,
			createdAt: Date.now(),
			dateFolder: "2026-08-01",
			category: "default",
		};

		render(
			<FileCard
				file={file}
				isSelected={false}
				onSelect={onSelect}
				onPreview={onPreview}
				onDownload={jest.fn()}
			/>,
		);

		await user.click(screen.getByRole("checkbox", { name: "Select video.mp4" }));

		expect(onSelect).toHaveBeenCalledWith(file.path);
		expect(onPreview).not.toHaveBeenCalled();
	});
});
