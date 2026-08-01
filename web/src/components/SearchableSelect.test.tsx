import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchableSelect from "./SearchableSelect";

describe("SearchableSelect", () => {
	it("keeps the typed value when creating a new option", async () => {
		const user = userEvent.setup();
		const onChange = jest.fn();

		render(
			<SearchableSelect
				options={["default", "BP"]}
				value="default"
				onChange={onChange}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /default/i }));
		await user.type(screen.getByRole("textbox", { name: "Search options" }), "new-category");
		await user.click(screen.getByRole("option", { name: 'Create "new-category"' }));

		expect(onChange).toHaveBeenCalledWith("new-category");
		expect(onChange).not.toHaveBeenCalledWith("default");
	});
});
